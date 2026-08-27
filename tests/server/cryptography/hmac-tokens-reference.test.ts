import { describe, expect, it } from "vitest";

import { redactLogValue } from "@/server/logging/redaction";
import {
  createPhoneLookupHmac,
  createRateLimitHmac,
} from "@/server/modules/cryptography/hmac";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import {
  generateRespondentReferenceId,
  generateUniqueRespondentReferenceId,
} from "@/server/modules/cryptography/reference-id";
import {
  generateSecureToken,
  hashSecureToken,
  verifySecureToken,
} from "@/server/modules/cryptography/tokens";

describe("domain-separated HMAC primitives", () => {
  const registry = new VersionedKeyRegistry(
    3,
    new Map([[3, Buffer.alloc(32, 7)]]),
  );

  it("is stable only within the same survey and key version", () => {
    const first = createPhoneLookupHmac("survey-a", "+12025550123", registry);
    const repeat = createPhoneLookupHmac("survey-a", "+12025550123", registry);
    const otherSurvey = createPhoneLookupHmac(
      "survey-b",
      "+12025550123",
      registry,
    );
    expect(first.keyVersion).toBe(3);
    expect(first.digest).toEqual(repeat.digest);
    expect(first.digest).not.toEqual(otherSurvey.digest);
    expect(first.digest).not.toEqual(
      createPhoneLookupHmac("survey-a", "+12025550124", registry).digest,
    );
  });

  it("rejects non-normalized phone input", () => {
    for (const malformed of ["2025550123", "+1 202 555 0123", "+0123", "+abc"])
      expect(() =>
        createPhoneLookupHmac("survey-a", malformed, registry),
      ).toThrow();
  });

  it("keeps rate-limit digests in a distinct key and domain", () => {
    const key = Buffer.alloc(32, 9);
    expect(createRateLimitHmac("ip-prefix", "203.0.113.0/24", key)).toEqual(
      createRateLimitHmac("ip-prefix", "203.0.113.0/24", key),
    );
    expect(createRateLimitHmac("ip-prefix", "203.0.113.0/24", key)).not.toEqual(
      createRateLimitHmac("employee-email", "203.0.113.0/24", key),
    );
  });
});

describe("secure tokens", () => {
  it("generates 256 bits and stores only a SHA-256 hash", () => {
    const tokens = Array.from({ length: 64 }, generateSecureToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(hashSecureToken(token)).toHaveLength(32);
      expect(verifySecureToken(token, hashSecureToken(token))).toBe(true);
    }
  });

  it("rejects invalid or mismatched material", () => {
    const token = generateSecureToken();
    const otherToken = generateSecureToken();
    expect(hashSecureToken(otherToken)).not.toEqual(hashSecureToken(token));
    expect(verifySecureToken(otherToken, hashSecureToken(token))).toBe(false);
    expect(verifySecureToken("malformed", hashSecureToken(token))).toBe(false);
    expect(verifySecureToken(token, Buffer.alloc(4))).toBe(false);
  });

  it("redacts raw token material from structured log contexts", () => {
    const token = generateSecureToken();
    expect(
      JSON.stringify(redactLogValue({ attemptToken: token })),
    ).not.toContain(token);
  });
});

describe("respondent reference IDs", () => {
  it("uses 12 uppercase non-ambiguous Crockford Base32 characters", () => {
    const values = Array.from({ length: 4_096 }, () =>
      generateRespondentReferenceId(),
    );
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^R-[0-9A-HJKMNP-TV-Z]{12}$/);
      expect(value).not.toMatch(/[ILOU]/);
    }
  });

  it("retries collisions and returns the first available ID", async () => {
    const generated = ["R-000000000001", "R-000000000001", "R-000000000002"];
    let checks = 0;
    await expect(
      generateUniqueRespondentReferenceId(
        async () => {
          checks += 1;
          return checks < 3;
        },
        { generate: () => generated.shift()!, maxAttempts: 3 },
      ),
    ).resolves.toBe("R-000000000002");
  });

  it("fails after a bounded collision retry budget", async () => {
    await expect(
      generateUniqueRespondentReferenceId(async () => true, {
        generate: () => "R-000000000001",
        maxAttempts: 2,
      }),
    ).rejects.toThrow("Unable to allocate");
  });
});
