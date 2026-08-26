import { describe, expect, it } from "vitest";

import { assertTrustedMutationOrigin } from "@/server/http/csrf";

describe("mutation origin guard", () => {
  it("accepts same-origin mutation requests", () => {
    const request = new Request("https://survey.example.com/api/example", {
      method: "POST",
      headers: {
        origin: "https://survey.example.com",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(() =>
      assertTrustedMutationOrigin(request, "https://survey.example.com"),
    ).not.toThrow();
  });

  it("rejects cross-site mutation requests", () => {
    const request = new Request("https://survey.example.com/api/example", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });

    expect(() =>
      assertTrustedMutationOrigin(request, "https://survey.example.com"),
    ).toThrow("origin verification");
  });
});
