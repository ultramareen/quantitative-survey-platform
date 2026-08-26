import { describe, expect, it } from "vitest";

import { redactLogValue } from "@/server/logging/redaction";

describe("structured-log redaction", () => {
  it("redacts sensitive fields recursively", () => {
    expect(
      redactLogValue({
        surveyId: "synthetic-survey",
        phone: "+10000000000",
        nested: { authorization: "Bearer synthetic", answerCount: 3 },
      }),
    ).toEqual({
      surveyId: "synthetic-survey",
      phone: "[REDACTED]",
      nested: { authorization: "[REDACTED]", answerCount: 3 },
    });
  });

  it("handles circular objects without serializing them", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(redactLogValue(value)).toEqual({ self: "[CIRCULAR]" });
  });
});
