import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonRequest } from "@/server/http/request-validation";

describe("request validation", () => {
  const schema = z.object({ label: z.string().min(1) }).strict();

  it("returns typed validated JSON", async () => {
    const request = new Request("https://survey.example.com/api/example", {
      method: "POST",
      body: JSON.stringify({ label: "synthetic" }),
    });

    await expect(parseJsonRequest(request, schema)).resolves.toEqual({
      label: "synthetic",
    });
  });

  it("maps malformed and unexpected input to safe validation failures", async () => {
    const request = new Request("https://survey.example.com/api/example", {
      method: "POST",
      body: JSON.stringify({ label: "synthetic", unexpected: "private-value" }),
    });

    await expect(parseJsonRequest(request, schema)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      safeMessage: "The request contains invalid fields.",
    });
  });
});
