import { performance } from "node:perf_hooks";

import * as argon2 from "argon2";
import { describe, expect, it } from "vitest";

import {
  ARGON2ID_PARAMETERS,
  hashPassword,
  inspectArgon2idVerifier,
  verifyPassword,
} from "@/server/modules/cryptography/password";

describe("Argon2id password verifiers", () => {
  it("uses the frozen parameters and a unique 16-byte salt", async () => {
    const password = "synthetic-correct-horse-battery-staple";
    const [first, second] = await Promise.all([
      hashPassword(password),
      hashPassword(password),
    ]);
    expect(first).not.toBe(second);
    expect(inspectArgon2idVerifier(first)).toEqual(ARGON2ID_PARAMETERS);
    expect(await verifyPassword(first, password)).toBe(true);
    expect(await verifyPassword(first, "incorrect-password")).toBe(false);
    expect(await verifyPassword("malformed-verifier", password)).toBe(false);

    const belowMinimum = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 8 * 1024,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
      salt: Buffer.alloc(16, 5),
    });
    expect(await verifyPassword(belowMinimum, password)).toBe(false);
  });

  it("runs successfully within a conservative Netlify Node runtime sanity bound", async () => {
    const started = performance.now();
    const verifier = await hashPassword("synthetic-runtime-benchmark-password");
    const elapsedMilliseconds = performance.now() - started;
    expect(
      await verifyPassword(verifier, "synthetic-runtime-benchmark-password"),
    ).toBe(true);
    expect(elapsedMilliseconds).toBeLessThan(10_000);
  }, 15_000);
});
