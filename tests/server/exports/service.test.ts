import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { encryptEnvelope } from "@/server/modules/cryptography";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import type { ExportAttemptRow } from "@/server/modules/exports/repository";
import {
  ExportService,
  neutralizeSpreadsheetText,
  partitionSize,
} from "@/server/modules/exports/service";
import type { EmployeePrincipal } from "@/types/employee";

const keyring = new VersionedKeyRegistry(
  1,
  new Map([[1, Buffer.alloc(32, 1)]]),
);
const cryptography = {
  piiEncryptionKeys: keyring,
  phoneLookupKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 2)]]),
  ),
  rateLimitHmacKey: Buffer.alloc(32, 3),
};
const surveyId = "00000000-0000-4000-8000-000000000001";
const respondentId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";
const principals = {
  productManager: principal("PRODUCT_MANAGER"),
  researcher: principal("RESEARCHER"),
  admin: principal("ADMIN"),
};

class RepositoryFixture {
  surveyCalls = 0;
  countCalls = 0;
  attemptCalls = 0;
  statuses: string[] = [];
  countOverride?: number;
  audits: Record<string, unknown>[] = [];
  rows: ExportAttemptRow[] = [];
  async survey() {
    this.surveyCalls++;
    return { id: surveyId, title: "Synthetic Survey", status: "ACTIVE" };
  }
  async questions() {
    return [
      {
        position: 1,
        prompt: "Choose",
        type: "MULTIPLE_CHOICE" as const,
        options: [
          { position: 1, label: "Alpha" },
          { position: 2, label: "Бета" },
        ],
      },
      {
        position: 2,
        prompt: "Explain",
        type: "FREE_TEXT" as const,
        options: [],
      },
    ];
  }
  async attemptEstimate(_surveyId?: string, status?: string) {
    this.countCalls++;
    if (status) this.statuses.push(status);
    return {
      count: this.countOverride ?? this.rows.length,
      payload_bytes: this.rows.reduce(
        (total, row) => total + row.payload_ciphertext.length,
        0,
      ),
    };
  }
  async attempts(_surveyId?: string, status?: string) {
    this.attemptCalls++;
    if (status) this.statuses.push(status);
    return this.rows;
  }
  async snapshot() {
    return {
      id: "snapshot",
      snapshot_number: 1,
      data_cutoff_at: new Date("2026-08-29T00:00:00Z"),
      aggregate_results: {
        funnel: {
          opened: 1,
          identified: 1,
          started: 1,
          startedPercentage: 100,
          greaterThanHalf: 1,
          greaterThanHalfPercentage: 100,
          completed: 1,
          completedPercentage: 100,
        },
        questions: [],
      },
    };
  }
  async audit(input: Record<string, unknown>) {
    this.audits.push(input);
  }
}

describe("Phase 11 export safety", () => {
  it.each(["=x", "+x", "-x", "@x", "\tx", "\rx", "\nx", "  =x"])(
    "neutralizes dangerous spreadsheet prefix %j",
    (value) => expect(neutralizeSpreadsheetText(value)).toBe(`'${value}`),
  );

  it.each(["ordinary", " Unicode 👩🏽‍🔬", "", null])(
    "preserves safe text %j",
    (value) => expect(neutralizeSpreadsheetText(value)).toBe(value ?? ""),
  );

  it("uses a deterministic predicted byte/time partition size", () => {
    expect(partitionSize(20)).toBe(partitionSize(20));
    expect(partitionSize(50)).toBeLessThan(partitionSize(1));
    expect(partitionSize(1, 32_000)).toBeLessThan(partitionSize(1, 100));
    expect(partitionSize(50)).toBeGreaterThan(0);
  });

  it("returns 403 for Product Manager before respondent query or decryption", async () => {
    const repository = new RepositoryFixture();
    const service = fixture(repository);
    for (const kind of ["current", "archived", "free-text"] as const)
      await expect(
        service.create(principals.productManager, surveyId, {
          kind,
          questionPosition: kind === "free-text" ? 2 : undefined,
          part: 1,
        }),
      ).rejects.toMatchObject({ status: 403 });
    expect(repository.surveyCalls).toBe(0);
    expect(repository.countCalls).toBe(0);
    expect(repository.attemptCalls).toBe(0);
    expect(repository.audits).toEqual([]);
  });

  it.each([principals.researcher, principals.admin])(
    "exports formula-safe Unicode, long free text, multiple selections, and blank cells for $role",
    async (actor) => {
      const repository = new RepositoryFixture();
      const longText = `=HYPERLINK("bad") ${"界".repeat(5000)}`;
      repository.rows = [attempt([1, 2], longText), attempt(undefined, "")];
      const result = await fixture(repository).create(actor, surveyId, {
        kind: "current",
        part: 1,
      });
      const buffer = await consume(result.stream);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet("Export")!;
      expect(sheet.getRow(7).values).toContain("Alpha; Бета");
      expect(sheet.getRow(7).values).toContain(`'${longText}`);
      expect(sheet.getRow(8).getCell(8).value).toBeNull();
      expect(sheet.getRow(8).getCell(9).value).toBeNull();
      expect(repository.audits[0]).toMatchObject({
        action: "RESPONDENT_CURRENT_EXPORTED",
        affectedRows: 2,
        safeMetadata: { kind: "current", part: 1, totalParts: 1 },
      });
      expect(JSON.stringify(repository.audits)).not.toMatch(
        /HYPERLINK|Synthetic Person|1202555|界/,
      );
    },
  );

  it("keeps archived attempts in the separate export query", async () => {
    const repository = new RepositoryFixture();
    repository.rows = [attempt(undefined, "archived")];
    await fixture(repository).create(principals.researcher, surveyId, {
      kind: "archived",
      part: 1,
    });
    expect(repository.attemptCalls).toBe(1);
    expect(repository.statuses).toEqual(["ARCHIVED", "ARCHIVED"]);
    expect(repository.audits[0]).toMatchObject({
      action: "RESPONDENT_ARCHIVED_EXPORTED",
    });
  });

  it("reports deterministic bounded partitions without a product row cap", async () => {
    const repository = new RepositoryFixture();
    repository.countOverride = partitionSize(2) + 1;
    repository.rows = [attempt(undefined, "part one")];
    const result = await fixture(repository).create(
      principals.researcher,
      surveyId,
      { kind: "free-text", questionPosition: 2, part: 1 },
    );
    expect(result.totalParts).toBe(2);
    expect(result.filename).toContain("part-1-of-2");
    expect(repository.audits[0]).toMatchObject({
      safeMetadata: {
        kind: "free-text",
        questionPosition: 2,
        part: 1,
        totalParts: 2,
      },
    });
    await consume(result.stream);
  });

  it("allows Product Manager aggregate snapshot export", async () => {
    const repository = new RepositoryFixture();
    const result = await fixture(repository).create(
      principals.productManager,
      surveyId,
      { kind: "aggregate", snapshotNumber: 1, part: 1 },
    );
    expect((await consume(result.stream)).byteLength).toBeGreaterThan(0);
    expect(repository.attemptCalls).toBe(0);
    expect(repository.audits).toEqual([]);
  });

  it("scrubs encrypted plaintext-bearing buffers when the connection aborts", async () => {
    const repository = new RepositoryFixture();
    const row = attempt(undefined, "sensitive");
    repository.rows = [row];
    const result = await fixture(repository).create(
      principals.researcher,
      surveyId,
      { kind: "current", part: 1 },
    );
    (result.stream as Readable).destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...row.payload_ciphertext].every((byte) => byte === 0)).toBe(true);
    expect(repository.rows).toEqual([]);
  });
});

function fixture(repository: RepositoryFixture) {
  return new ExportService(
    repository as never,
    cryptography,
    () => new Date("2026-08-29T12:00:00Z"),
  );
}

function principal(role: EmployeePrincipal["role"]): EmployeePrincipal {
  return {
    id: `${role.toLowerCase()}-id`,
    email: `${role.toLowerCase()}@synthetic.invalid`,
    displayName: role,
    role,
    authorizationVersion: 1,
  };
}

function attempt(
  multiple: number[] | undefined,
  freeText: string,
): ExportAttemptRow {
  const name = encryptEnvelope(
    "Synthetic Person",
    { purpose: "RESPONDENT_NAME", recordId: respondentId, contextVersion: 1 },
    keyring,
  );
  const phone = encryptEnvelope(
    "+12025550123",
    { purpose: "RESPONDENT_PHONE", recordId: respondentId, contextVersion: 1 },
    keyring,
  );
  const payload = encryptEnvelope(
    JSON.stringify({ answers: { 1: multiple, 2: freeText } }),
    { purpose: "ANSWER_PAYLOAD", recordId: attemptId, contextVersion: 1 },
    keyring,
  );
  return {
    attempt_id: attemptId,
    respondent_id: respondentId,
    reference_id: "R-7K3M9W2X8Q4D",
    name_ciphertext: name.sealedPayload,
    name_nonce: name.nonce,
    name_key_version: name.keyVersion,
    phone_ciphertext: phone.sealedPayload,
    phone_nonce: phone.nonce,
    phone_key_version: phone.keyVersion,
    payload_ciphertext: payload.sealedPayload,
    payload_nonce: payload.nonce,
    payload_key_version: payload.keyVersion,
    attempt_number: 1,
    created_at: new Date("2026-08-28T00:00:00Z"),
    started_at: null,
    last_answer_changed_at: null,
    archived_at: new Date("2026-08-28T01:00:00Z"),
    archive_reason: "REPLACED",
  };
}

async function consume(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.from(stream))
    chunks.push(Buffer.from(chunk));
  return Uint8Array.from(Buffer.concat(chunks)).buffer;
}
