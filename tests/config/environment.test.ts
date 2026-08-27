import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AppError } from "@/server/errors/app-error";
import { parseServerEnvironment } from "@/server/config/schema";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "synthetic-test-secret-that-is-long-enough",
  DATABASE_URL: "postgresql://synthetic:synthetic@localhost:26257/test",
  LOG_LEVEL: "info",
  PII_ENCRYPTION_ACTIVE_VERSION: "1",
  PII_ENCRYPTION_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
  PHONE_LOOKUP_HMAC_ACTIVE_VERSION: "1",
  PHONE_LOOKUP_HMAC_KEY_V1: Buffer.alloc(32, 2).toString("base64"),
  RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 3).toString("base64"),
};

describe("server environment", () => {
  it("accepts complete synthetic configuration", () => {
    expect(parseServerEnvironment(validEnvironment)).toMatchObject({
      APP_ENV: "test",
      APP_ORIGIN: "http://localhost:3000",
      LOG_LEVEL: "info",
    });
  });

  it("fails closed when a required secret is missing", () => {
    const missingSecret = { ...validEnvironment };
    delete missingSecret.BETTER_AUTH_SECRET;

    expect(() => parseServerEnvironment(missingSecret)).toThrowError(AppError);
    expect(() => parseServerEnvironment(missingSecret)).toThrow(
      "BETTER_AUTH_SECRET",
    );
  });

  it("rejects insecure non-local application origins", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        APP_ORIGIN: "http://survey.example.com",
      }),
    ).toThrow("APP_ORIGIN");
  });

  it("fails closed when the active encryption key is missing", () => {
    const missingActiveKey = { ...validEnvironment };
    delete missingActiveKey.PII_ENCRYPTION_KEY_V1;

    expect(() => parseServerEnvironment(missingActiveKey)).toThrow(
      "PII_ENCRYPTION_KEY_Vn",
    );
  });

  it("rejects cross-purpose key reuse without exposing key material", () => {
    const duplicated = {
      ...validEnvironment,
      PHONE_LOOKUP_HMAC_KEY_V1: validEnvironment.PII_ENCRYPTION_KEY_V1,
    };

    expect(() => parseServerEnvironment(duplicated)).toThrow(
      "independent cryptographic keys",
    );
    try {
      parseServerEnvironment(duplicated);
    } catch (error) {
      expect(String(error)).not.toContain(
        validEnvironment.PII_ENCRYPTION_KEY_V1!,
      );
    }
  });

  it("never includes secret contents in validation errors", () => {
    const malformedSecret = "do-not-print-this-secret";

    try {
      parseServerEnvironment({
        ...validEnvironment,
        BETTER_AUTH_SECRET: malformedSecret,
      });
      throw new Error("Expected configuration validation to fail");
    } catch (error) {
      expect(String(error)).not.toContain(malformedSecret);
    }
  });

  it("keeps backup keys outside runtime examples and uses placeholders only", async () => {
    const example = await readFile(join(process.cwd(), ".env.example"), "utf8");
    expect(example).not.toMatch(/^BACKUP_ENCRYPTION_KEY=/m);
    expect(example).toContain("replace-with-base64-encoded-32-byte-key");
    expect(example).not.toMatch(
      /^NEXT_PUBLIC_.*(?:SECRET|TOKEN|PASSWORD|KEY|DATABASE)/m,
    );
  });
});
