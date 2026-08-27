import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { toSafeErrorResponse } from "@/server/errors/app-error";
import { writeStructuredLog } from "@/server/logging/logger";
import {
  decryptEnvelope,
  encryptEnvelope,
  type EncryptedEnvelope,
} from "@/server/modules/cryptography/aes-gcm";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";

const context = {
  purpose: "ANSWER_PAYLOAD" as const,
  recordId: "6f44a845-e52b-4f27-bf2b-94089593b231",
  contextVersion: 1,
};
const plaintext = "synthetic-choice-and-free-text-answer";

function registry(activeVersion = 1, retainVersionOne = true) {
  const keys = new Map<number, Buffer>();
  if (retainVersionOne) keys.set(1, Buffer.alloc(32, 1));
  if (activeVersion === 2) keys.set(2, Buffer.alloc(32, 2));
  return new VersionedKeyRegistry(activeVersion, keys);
}

function clone(envelope: EncryptedEnvelope): EncryptedEnvelope {
  return {
    ...envelope,
    nonce: Buffer.from(envelope.nonce),
    sealedPayload: Buffer.from(envelope.sealedPayload),
  };
}

describe("AES-256-GCM envelopes", () => {
  it("round-trips bytes and strings with explicit version metadata", () => {
    const envelope = encryptEnvelope(plaintext, context, registry());
    expect(envelope.envelopeVersion).toBe(1);
    expect(envelope.keyVersion).toBe(1);
    expect(envelope.nonce).toHaveLength(12);
    expect(envelope.sealedPayload.subarray(0, 4).toString("ascii")).toBe(
      "QSP1",
    );
    expect(decryptEnvelope(envelope, context, registry()).toString()).toBe(
      plaintext,
    );

    for (let size = 0; size <= 256; size += 17) {
      const value = randomBytes(size);
      const encrypted = encryptEnvelope(value, context, registry());
      expect(decryptEnvelope(encrypted, context, registry())).toEqual(value);
    }
  });

  it("uses a fresh 96-bit nonce and different ciphertext every time", () => {
    const envelopes = Array.from({ length: 128 }, () =>
      encryptEnvelope(plaintext, context, registry()),
    );
    expect(
      new Set(envelopes.map(({ nonce }) => nonce.toString("hex"))).size,
    ).toBe(envelopes.length);
    expect(
      new Set(
        envelopes.map(({ sealedPayload }) => sealedPayload.toString("hex")),
      ).size,
    ).toBe(envelopes.length);
  });

  it.each([
    ["purpose", { ...context, purpose: "RESPONDENT_NAME" as const }],
    ["record", { ...context, recordId: "different-record" }],
    ["context version", { ...context, contextVersion: 2 }],
  ])("rejects wrong AAD %s", (_label, wrongContext) => {
    const envelope = encryptEnvelope(plaintext, context, registry());
    expect(() => decryptEnvelope(envelope, wrongContext, registry())).toThrow(
      "Cryptographic operation failed",
    );
  });

  it("reads a retained old key but fails closed for a missing/wrong version", () => {
    const oldEnvelope = encryptEnvelope(plaintext, context, registry());
    expect(decryptEnvelope(oldEnvelope, context, registry(2)).toString()).toBe(
      plaintext,
    );

    const wrongVersion = clone(oldEnvelope);
    wrongVersion.keyVersion = 2;
    expect(() => decryptEnvelope(wrongVersion, context, registry(2))).toThrow();
    expect(() =>
      decryptEnvelope(oldEnvelope, context, registry(2, false)),
    ).toThrow();
    expect(() =>
      decryptEnvelope(
        oldEnvelope,
        context,
        new VersionedKeyRegistry(1, new Map([[1, Buffer.alloc(32, 9)]])),
      ),
    ).toThrow();
  });

  it.each(["ciphertext", "nonce", "tag"])("rejects a modified %s", (part) => {
    const envelope = clone(encryptEnvelope(plaintext, context, registry()));
    if (part === "nonce") envelope.nonce[0] ^= 1;
    else if (part === "tag")
      envelope.sealedPayload[envelope.sealedPayload.length - 1] ^= 1;
    else envelope.sealedPayload[4] ^= 1;
    expect(() => decryptEnvelope(envelope, context, registry())).toThrow(
      "Cryptographic operation failed",
    );
  });

  it("rejects malformed, truncated, and unknown envelope versions", () => {
    const envelope = encryptEnvelope(plaintext, context, registry());
    for (let length = 0; length < 20; length += 1) {
      expect(() =>
        decryptEnvelope(
          {
            ...envelope,
            sealedPayload: envelope.sealedPayload.subarray(0, length),
          },
          context,
          registry(),
        ),
      ).toThrow("Cryptographic operation failed");
    }
    expect(() =>
      decryptEnvelope(
        { ...envelope, envelopeVersion: 2 as 1 },
        context,
        registry(),
      ),
    ).toThrow();
    const wrongMagic = clone(envelope);
    wrongMagic.sealedPayload[0] ^= 1;
    expect(() => decryptEnvelope(wrongMagic, context, registry())).toThrow();
  });

  it("fails with a redacted response/log and never includes plaintext or key bytes", () => {
    const envelope = clone(encryptEnvelope(plaintext, context, registry()));
    envelope.sealedPayload[envelope.sealedPayload.length - 1] ^= 1;
    let failure: unknown;
    try {
      decryptEnvelope(envelope, context, registry());
    } catch (error) {
      failure = error;
    }
    const response = toSafeErrorResponse(failure);
    expect(JSON.stringify(response)).not.toContain(plaintext);
    expect(String(failure)).not.toContain(plaintext);

    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    writeStructuredLog("warn", "cryptography.decrypt_failed", {
      errorCode: response.body.error.code,
    });
    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("CRYPTOGRAPHIC_OPERATION_FAILED");
    expect(output).not.toContain(plaintext);
    expect(output).not.toContain(Buffer.alloc(32, 1).toString("base64"));
  });
});
