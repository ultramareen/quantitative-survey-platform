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
});
