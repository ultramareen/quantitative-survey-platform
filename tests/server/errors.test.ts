import { describe, expect, it } from "vitest";

import { AppError, toSafeErrorResponse } from "@/server/errors/app-error";

describe("safe error mapping", () => {
  it("returns only the designated safe message", () => {
    const error = new AppError({
      category: "INTERNAL",
      code: "SYNTHETIC_FAILURE",
      message: "Internal detail containing credential-value",
      safeMessage: "The request failed safely.",
      status: 500,
    });

    const response = toSafeErrorResponse(error);

    expect(response.body.error.message).toBe("The request failed safely.");
    expect(JSON.stringify(response)).not.toContain("credential-value");
  });

  it("maps unknown failures to a generic response", () => {
    expect(toSafeErrorResponse(new Error("private detail"))).toEqual({
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed.",
        },
      },
    });
  });
});
