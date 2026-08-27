import "server-only";

import { randomBytes } from "node:crypto";

import * as argon2 from "argon2";

export const ARGON2ID_PARAMETERS = Object.freeze({
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

export async function hashPassword(password: string): Promise<string> {
  validatePasswordInput(password);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2ID_PARAMETERS.memoryCost,
    timeCost: ARGON2ID_PARAMETERS.timeCost,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    hashLength: ARGON2ID_PARAMETERS.hashLength,
    salt: randomBytes(ARGON2ID_PARAMETERS.saltLength),
  });
}

export async function verifyPassword(
  verifier: string,
  password: string,
): Promise<boolean> {
  try {
    validatePasswordInput(password);
    const parameters = inspectArgon2idVerifier(verifier);
    if (
      !parameters ||
      parameters.memoryCost < ARGON2ID_PARAMETERS.memoryCost ||
      parameters.timeCost < ARGON2ID_PARAMETERS.timeCost ||
      parameters.parallelism !== ARGON2ID_PARAMETERS.parallelism ||
      parameters.saltLength < ARGON2ID_PARAMETERS.saltLength ||
      parameters.hashLength < ARGON2ID_PARAMETERS.hashLength
    ) {
      return false;
    }
    return await argon2.verify(verifier, password);
  } catch {
    return false;
  }
}

export type Argon2idVerifierParameters = {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  saltLength: number;
  hashLength: number;
};

export function inspectArgon2idVerifier(
  verifier: string,
): Argon2idVerifierParameters | null {
  const match = /^\$argon2id\$v=19\$([^$]+)\$([^$]+)\$([^$]+)$/.exec(verifier);
  if (!match) return null;
  const parameters = Object.fromEntries(
    match[1].split(",").map((entry) => entry.split("=", 2)),
  );
  if (!parameters.m || !parameters.t || !parameters.p) return null;
  const memoryCost = Number(parameters.m);
  const timeCost = Number(parameters.t);
  const parallelism = Number(parameters.p);
  if (
    ![memoryCost, timeCost, parallelism].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  ) {
    return null;
  }
  const salt = decodeUnpaddedBase64(match[2]);
  const hash = decodeUnpaddedBase64(match[3]);
  if (!salt || !hash) return null;
  return {
    memoryCost,
    timeCost,
    parallelism,
    saltLength: salt.length,
    hashLength: hash.length,
  };
}

function decodeUnpaddedBase64(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64");
  } catch {
    return null;
  }
}

function validatePasswordInput(password: string): void {
  const length = Buffer.byteLength(password, "utf8");
  if (length < 1 || length > 1024)
    throw new TypeError("Invalid password input");
}
