import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonRequest } from "@/server/http/request-validation";

const schema = z.object({ value: z.string() }).strict();

describe("bounded JSON request parsing", () => {
  it("parses a valid bounded body", async () => {
    await expect(
      parseJsonRequest(
        new Request("https://example.invalid", {
          method: "POST",
          body: JSON.stringify({ value: "synthetic" }),
        }),
        schema,
        128,
      ),
    ).resolves.toEqual({ value: "synthetic" });
  });

  it("rejects declared and streamed oversized bodies with 413", async () => {
    const declared = new Request("https://example.invalid", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "999" },
    });
    await expect(parseJsonRequest(declared, schema, 16)).rejects.toMatchObject({
      status: 413,
    });
    const streamed = new Request("https://example.invalid", {
      method: "POST",
      body: JSON.stringify({ value: "too-long" }),
    });
    await expect(parseJsonRequest(streamed, schema, 8)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("fails malformed or schema-invalid JSON without echoing content", async () => {
    await expect(
      parseJsonRequest(
        new Request("https://example.invalid", {
          method: "POST",
          body: "secret-invalid",
        }),
        schema,
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
    await expect(
      parseJsonRequest(
        new Request("https://example.invalid", { method: "POST", body: "{}" }),
        schema,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
  });
});
