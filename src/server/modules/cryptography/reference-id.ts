import "server-only";

import { randomBytes } from "node:crypto";

import { cryptographyFailure } from "@/server/modules/cryptography/errors";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_BYTES = 8;
const RANDOM_BITS_MASK = (1n << 60n) - 1n;
const DEFAULT_MAX_ATTEMPTS = 8;

export function generateRespondentReferenceId(
  entropy: (size: number) => Buffer = randomBytes,
): string {
  const bytes = entropy(RANDOM_BYTES);
  if (bytes.length !== RANDOM_BYTES) throw cryptographyFailure();
  let value = bytes.readBigUInt64BE() & RANDOM_BITS_MASK;
  let encoded = "";
  for (let index = 0; index < 12; index += 1) {
    encoded = CROCKFORD_ALPHABET[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return `R-${encoded}`;
}

export async function generateUniqueRespondentReferenceId(
  isAlreadyUsed: (referenceId: string) => Promise<boolean>,
  options: {
    maxAttempts?: number;
    generate?: () => string;
  } = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const generate = options.generate ?? generateRespondentReferenceId;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 100
  ) {
    throw cryptographyFailure();
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generate();
    if (!(await isAlreadyUsed(candidate))) return candidate;
  }
  throw new CryptographicReferenceIdExhaustedError();
}

export class CryptographicReferenceIdExhaustedError extends Error {
  constructor() {
    super("Unable to allocate a respondent reference ID");
    this.name = "CryptographicReferenceIdExhaustedError";
  }
}
