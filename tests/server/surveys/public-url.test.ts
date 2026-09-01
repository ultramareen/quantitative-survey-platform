import { describe, expect, it } from "vitest";

import { buildPublicSurveyUrl } from "@/server/modules/surveys/public-url";

describe("public survey URL", () => {
  it("builds a complete URL from the configured application origin", () => {
    expect(
      buildPublicSurveyUrl("stable-public-token", "https://survey.example.com"),
    ).toBe("https://survey.example.com/survey/stable-public-token");
  });
});
