import { describe, expect, it } from "vitest";
import { validateProductionReleaseEvidence } from "@/server/modules/infrastructure/release-evidence";

const now = new Date("2026-08-29T12:00:00.000Z");
const item = {
  passed: true as const,
  checkedAt: now.toISOString(),
  custodian: "Synthetic Custodian",
  safeReference: "OPS-SYNTHETIC-1",
};
const complete = {
  environment: "production" as const,
  syntheticOnly: true as const,
  netlifyFreeNoRecharge: item,
  cockroachZeroDollarLimit: item,
  brevoFreeAndSenderVerified: item,
  nativeProviderAlerts: item,
  scheduledFunctionDelivery: item,
  previewSmoke: item,
  productionSyntheticSmoke: item,
  migrationRehearsal: item,
  restoreDrill: item,
  capacityLoadGate: item,
  authorizationNegativeGate: item,
  smokeDataRemoved: item,
  finalApproval: item,
};

describe("production release evidence", () => {
  it("accepts a complete current safe-reference record", () => {
    expect(
      validateProductionReleaseEvidence(complete, now).finalApproval.passed,
    ).toBe(true);
  });
  it("rejects missing, failed, stale, and unexpected evidence", () => {
    expect(() =>
      validateProductionReleaseEvidence(
        { ...complete, finalApproval: undefined },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateProductionReleaseEvidence(
        { ...complete, restoreDrill: { ...item, passed: false } },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateProductionReleaseEvidence(
        {
          ...complete,
          capacityLoadGate: { ...item, checkedAt: "2026-08-01T00:00:00.000Z" },
        },
        now,
      ),
    ).toThrow("stale");
    expect(() =>
      validateProductionReleaseEvidence(
        { ...complete, secret: "must-not-be-accepted" },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateProductionReleaseEvidence(
        {
          ...complete,
          finalApproval: { ...item, token: "must-not-be-accepted" },
        },
        now,
      ),
    ).toThrow();
  });
});
