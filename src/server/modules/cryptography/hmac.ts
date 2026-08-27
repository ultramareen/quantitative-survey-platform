import "server-only";

import { createHmac } from "node:crypto";

import { cryptographyFailure } from "@/server/modules/cryptography/errors";
import type { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

export type VersionedDigest = { keyVersion: number; digest: Buffer };

export function createPhoneLookupHmac(
  surveyId: string,
  normalizedPhone: string,
  registry: VersionedKeyRegistry,
): VersionedDigest {
  if (!isIdentifier(surveyId) || !E164_PATTERN.test(normalizedPhone)) {
    throw cryptographyFailure();
  }
  const keyVersion = registry.activeVersion;
  return {
    keyVersion,
    digest: digest(
      registry.activeKey(),
      "QSP_PHONE_LOOKUP_HMAC_V1",
      String(keyVersion),
      surveyId,
      normalizedPhone,
    ),
  };
}

export function createRateLimitHmac(
  scope: string,
  normalizedSubject: string,
  key: Uint8Array,
): Buffer {
  if (
    !isIdentifier(scope) ||
    !isIdentifier(normalizedSubject) ||
    key.byteLength !== 32
  ) {
    throw cryptographyFailure();
  }
  return digest(
    Buffer.from(key),
    "QSP_RATE_LIMIT_HMAC_V1",
    scope,
    normalizedSubject,
  );
}

function digest(key: Buffer, ...parts: string[]): Buffer {
  const hmac = createHmac("sha256", key);
  for (const part of parts) {
    const value = Buffer.from(part, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(value.length);
    hmac.update(length);
    hmac.update(value);
  }
  return hmac.digest();
}

function isIdentifier(value: string): boolean {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}
