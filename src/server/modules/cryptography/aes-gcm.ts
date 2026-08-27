import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { cryptographyFailure } from "@/server/modules/cryptography/errors";
import type { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";

const ENVELOPE_MAGIC = Buffer.from("QSP1", "ascii");
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export const ENCRYPTION_ENVELOPE_VERSION = 1 as const;

export const encryptionPurposes = [
  "RESPONDENT_NAME",
  "RESPONDENT_PHONE",
  "ANSWER_PAYLOAD",
  "RESULT_FREE_TEXT_LABELS",
] as const;

export type EncryptionPurpose = (typeof encryptionPurposes)[number];

export type EncryptionContext = {
  purpose: EncryptionPurpose;
  recordId: string;
  contextVersion: number;
};

export type EncryptedEnvelope = {
  envelopeVersion: typeof ENCRYPTION_ENVELOPE_VERSION;
  keyVersion: number;
  nonce: Buffer;
  sealedPayload: Buffer;
};

export function encryptEnvelope(
  plaintext: Uint8Array | string,
  context: EncryptionContext,
  registry: VersionedKeyRegistry,
): EncryptedEnvelope {
  validateContext(context);
  const keyVersion = registry.activeVersion;
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", registry.activeKey(), nonce, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(createAad(context, keyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(asPlaintextBuffer(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    envelopeVersion: ENCRYPTION_ENVELOPE_VERSION,
    keyVersion,
    nonce,
    sealedPayload: Buffer.concat([ENVELOPE_MAGIC, ciphertext, tag]),
  };
}

export function decryptEnvelope(
  envelope: EncryptedEnvelope,
  context: EncryptionContext,
  registry: VersionedKeyRegistry,
): Buffer {
  try {
    validateContext(context);
    validateEnvelope(envelope);
    const key = registry.readKey(envelope.keyVersion);
    const ciphertext = envelope.sealedPayload.subarray(
      ENVELOPE_MAGIC.length,
      -AUTH_TAG_LENGTH,
    );
    const tag = envelope.sealedPayload.subarray(-AUTH_TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(createAad(context, envelope.keyVersion));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw cryptographyFailure();
  }
}

function validateEnvelope(envelope: EncryptedEnvelope): void {
  if (
    envelope.envelopeVersion !== ENCRYPTION_ENVELOPE_VERSION ||
    !Number.isSafeInteger(envelope.keyVersion) ||
    envelope.keyVersion < 1 ||
    !Buffer.isBuffer(envelope.nonce) ||
    envelope.nonce.length !== NONCE_LENGTH ||
    !Buffer.isBuffer(envelope.sealedPayload) ||
    envelope.sealedPayload.length < ENVELOPE_MAGIC.length + AUTH_TAG_LENGTH ||
    !envelope.sealedPayload
      .subarray(0, ENVELOPE_MAGIC.length)
      .equals(ENVELOPE_MAGIC)
  ) {
    throw cryptographyFailure();
  }
}

function validateContext(context: EncryptionContext): void {
  if (
    !encryptionPurposes.includes(context.purpose) ||
    typeof context.recordId !== "string" ||
    context.recordId.length < 1 ||
    context.recordId.length > 256 ||
    !Number.isSafeInteger(context.contextVersion) ||
    context.contextVersion < 1
  ) {
    throw cryptographyFailure();
  }
}

function createAad(context: EncryptionContext, keyVersion: number): Buffer {
  return encodeLengthPrefixed([
    "QSP_AES_256_GCM",
    String(ENCRYPTION_ENVELOPE_VERSION),
    String(keyVersion),
    context.purpose,
    context.recordId,
    String(context.contextVersion),
  ]);
}

function encodeLengthPrefixed(parts: readonly string[]): Buffer {
  return Buffer.concat(
    parts.flatMap((part) => {
      const value = Buffer.from(part, "utf8");
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(value.length);
      return [length, value];
    }),
  );
}

function asPlaintextBuffer(value: Uint8Array | string): Buffer {
  return typeof value === "string"
    ? Buffer.from(value, "utf8")
    : Buffer.from(value);
}
