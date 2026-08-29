import { describe, expect, it } from "vitest";
import {
  estimateNetlifyCredits,
  percent,
} from "@/server/modules/infrastructure/estimator";

describe("frozen free-tier release load model", () => {
  it("keeps the normal 5,000-respondent scenario below protection", () => {
    const estimate = estimateNetlifyCredits({
      dynamicRequests: 120_000,
      sampledExecutionMillis: 120_000 * 250,
      sampledResponseBytes: 120_000 * 8_000,
      sampledRequestCount: 120_000,
      staticRequestMultiplier: 0.33,
      productionDeployments: 1,
    });
    expect(percent(estimate.totalCredits, estimate.limitCredits)).toBeLessThan(
      95,
    );
  });

  it("drives the 10,000-respondent capacity case into protection rather than paid usage", () => {
    const estimate = estimateNetlifyCredits({
      dynamicRequests: 238_320,
      sampledExecutionMillis: 238_320 * 310,
      sampledResponseBytes: 238_320 * 6_300,
      sampledRequestCount: 238_320,
      staticRequestMultiplier: 70_000 / 238_320,
      productionDeployments: 2,
    });
    expect(
      percent(estimate.totalCredits, estimate.limitCredits),
    ).toBeGreaterThanOrEqual(95);
    expect(estimate.totalCredits).toBeGreaterThan(estimate.limitCredits);
  });
});
