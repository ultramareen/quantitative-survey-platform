import { describe, expect, it, vi } from "vitest";
import {
  decryptEnvelope,
  encryptEnvelope,
} from "@/server/modules/cryptography/aes-gcm";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import { PgReencryptionMaintenanceService } from "@/server/modules/cryptography/rotation";

describe("maintenance-only PII key rotation", () => {
  it("re-encrypts a bounded respondent batch and returns a resumable checkpoint", async () => {
    const oldKeys = new VersionedKeyRegistry(
      1,
      new Map([[1, Buffer.alloc(32, 1)]]),
    );
    const keys = new VersionedKeyRegistry(
      2,
      new Map([
        [1, Buffer.alloc(32, 1)],
        [2, Buffer.alloc(32, 2)],
      ]),
    );
    const id = "11111111-1111-4111-8111-111111111111";
    const name = encryptEnvelope(
      "Synthetic Person",
      { purpose: "RESPONDENT_NAME", recordId: id, contextVersion: 1 },
      oldKeys,
    );
    const phone = encryptEnvelope(
      "+12025550123",
      { purpose: "RESPONDENT_PHONE", recordId: id, contextVersion: 1 },
      oldKeys,
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id,
            name_ciphertext: name.sealedPayload,
            name_nonce: name.nonce,
            name_key_version: 1,
            phone_ciphertext: phone.sealedPayload,
            phone_nonce: phone.nonce,
            phone_key_version: 1,
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const result = await new PgReencryptionMaintenanceService(
      pool as never,
      keys,
    ).reencryptBatch({ fromVersion: 1, toVersion: 2, batchSize: 1 });
    expect(result).toEqual({
      checkpoint: { stage: "RESPONDENTS", afterId: id },
      processed: 1,
      complete: false,
    });
    const update = query.mock.calls[2]![1] as unknown[];
    expect(
      decryptEnvelope(
        {
          envelopeVersion: 1,
          sealedPayload: update[1] as Buffer,
          nonce: update[2] as Buffer,
          keyVersion: 2,
        },
        { purpose: "RESPONDENT_NAME", recordId: id, contextVersion: 1 },
        keys,
      ).toString(),
    ).toBe("Synthetic Person");
    expect(update.join(" ")).not.toContain("Synthetic Person");
  });

  it("walks empty stages to a complete result and validates the target key", async () => {
    const keys = new VersionedKeyRegistry(
      2,
      new Map([
        [1, Buffer.alloc(32, 1)],
        [2, Buffer.alloc(32, 2)],
      ]),
    );
    const query = vi.fn(async (sql: string) =>
      sql.startsWith("SELECT") ? { rows: [] } : {},
    );
    const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    await expect(
      new PgReencryptionMaintenanceService(pool as never, keys).reencryptBatch({
        fromVersion: 1,
        toVersion: 2,
        batchSize: 100,
      }),
    ).resolves.toEqual({ processed: 0, complete: true });
    await expect(
      new PgReencryptionMaintenanceService(pool as never, keys).reencryptBatch({
        fromVersion: 1,
        toVersion: 1,
        batchSize: 100,
      }),
    ).rejects.toThrow("distinct");
  });
});
