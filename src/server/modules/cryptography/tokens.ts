import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSecureToken(token: string): Buffer {
  if (
    !TOKEN_PATTERN.test(token) ||
    Buffer.from(token, "base64url").length !== TOKEN_BYTES
  ) {
    throw new TypeError("Invalid token material");
  }
  return createHash("sha256").update(token, "utf8").digest();
}

export function verifySecureToken(
  token: string,
  expectedHash: Uint8Array,
): boolean {
  const expected = Buffer.from(expectedHash);
  let candidate: Buffer;
  try {
    candidate = hashSecureToken(token);
  } catch {
    candidate = createHash("sha256").update("invalid-token", "utf8").digest();
  }
  if (expected.length !== candidate.length) {
    timingSafeEqual(candidate, Buffer.alloc(candidate.length));
    return false;
  }
  return timingSafeEqual(candidate, expected);
}
