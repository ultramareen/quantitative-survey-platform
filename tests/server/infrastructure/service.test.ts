import { describe, expect, it, vi } from "vitest";
import {
  estimateCockroach,
  estimateNetlifyCredits,
  percent,
} from "@/server/modules/infrastructure/estimator";
import {
  crossedThresholds,
  InfrastructureService,
} from "@/server/modules/infrastructure/service";
import type {
  InfrastructureRepository,
  UsageReading,
} from "@/server/modules/infrastructure/types";

const admin = {
  id: "admin",
  email: "admin@example.com",
  displayName: "Admin",
  role: "ADMIN" as const,
  authorizationVersion: 1,
};
const manager = { ...admin, id: "manager", role: "PRODUCT_MANAGER" as const };
const at = new Date("2026-08-29T12:00:00.000Z");

function reading(
  percentValue: number,
  provider: "NETLIFY" | "COCKROACH" | "BREVO" = "NETLIFY",
): UsageReading {
  return {
    provider,
    quota: "CREDITS",
    used: percentValue,
    limit: 100,
    percent: percentValue,
    source: "APPLICATION_ESTIMATE",
    period: "2026-08",
    resetsAt: null,
    updatedAt: at.toISOString(),
    stale: false,
    providerConsoleUrl: "https://example.invalid",
    drivesProtection: provider !== "BREVO",
    collectedAt: at,
  };
}

function repository(overrides: Partial<InfrastructureRepository> = {}) {
  return {
    readHeadline: vi.fn(),
    readAdminView: vi.fn(),
    evaluate: vi.fn().mockResolvedValue([reading(0)]),
    reserveThresholds: vi.fn().mockResolvedValue([]),
    activeAdminEmails: vi.fn().mockResolvedValue(["admin@example.com"]),
    markAlertsSent: vi.fn(),
    markAlertsFailed: vi.fn(),
    enforceCapacity: vi.fn(),
    pauseAll: vi.fn().mockResolvedValue(0),
    switchActive: vi.fn(),
    recordBrevoDelivery: vi.fn(),
    observeDeployment: vi.fn(),
    ...overrides,
  } as InfrastructureRepository;
}

describe("Phase 12 conservative estimators", () => {
  it("calculates request, compute, bandwidth, and idempotent deployment inputs independently", () => {
    const value = estimateNetlifyCredits({
      dynamicRequests: 10_000,
      sampledExecutionMillis: 2_000_000,
      sampledResponseBytes: 10_000_000,
      sampledRequestCount: 10_000,
      staticRequestMultiplier: 0.5,
      productionDeployments: 2,
    });
    expect(value.requestCredits).toBe(3);
    expect(value.computeCredits).toBeCloseTo(5.5556, 3);
    expect(value.bandwidthCredits).toBeCloseTo(0.2794, 3);
    expect(value.deploymentCredits).toBe(30);
    expect(value.totalCredits).toBeCloseTo(38.835, 3);
  });
  it("applies explicit Cockroach calibration and safe percentages", () => {
    expect(
      estimateCockroach({
        sampledRu: 100,
        calibrationMultiplier: 1.25,
        observedStorageBytes: 200,
        storageMultiplier: 1.1,
      }),
    ).toEqual({ ru: 125, storageBytes: 220.00000000000003 });
    expect(percent(95, 100)).toBe(95);
    expect(() => percent(1, 0)).toThrow();
  });
  it("keeps the three-hour scheduled-check compute plan within the frozen 0.17–0.67 monthly-credit range", () => {
    const low = estimateNetlifyCredits({
      dynamicRequests: 240,
      sampledExecutionMillis: 240 * 250,
      sampledResponseBytes: 0,
      sampledRequestCount: 240,
      staticRequestMultiplier: 0,
      productionDeployments: 0,
    });
    const high = estimateNetlifyCredits({
      dynamicRequests: 240,
      sampledExecutionMillis: 240 * 1_000,
      sampledResponseBytes: 0,
      sampledRequestCount: 240,
      staticRequestMultiplier: 0,
      productionDeployments: 0,
    });
    expect(low.computeCredits).toBeCloseTo(0.1667, 3);
    expect(high.computeCredits).toBeCloseTo(0.6667, 3);
  });
  it.each([
    [49, []],
    [50, [50]],
    [90, [50, 75, 90]],
    [99, [50, 75, 90, 95, 99]],
  ])("derives threshold crossings at %s", (value, expected) =>
    expect(crossedThresholds(value)).toEqual(expected),
  );
});

describe("Phase 12 infrastructure service authorization and protection", () => {
  it("exposes only the cached headline to every authenticated role", async () => {
    const repo = repository({
      readHeadline: vi.fn().mockResolvedValue({ percent: 25 }),
    });
    await new InfrastructureService(repo, { sendAlert: vi.fn() }).headline(
      manager,
    );
    expect(repo.readHeadline).toHaveBeenCalledOnce();
  });
  it("denies Admin detail, Pause All, and switch to Product Manager", () => {
    const service = new InfrastructureService(
      repository(),
      { sendAlert: vi.fn() },
      () => at,
    );
    expect(() => service.adminView(manager)).toThrow();
    expect(() => service.pauseAll(manager)).toThrow();
    expect(() => service.switchActive(manager, "public")).toThrow();
  });
  it.each([95, 99, 120])(
    "runs protection at a primary risk of %s without special 99%% completion behavior",
    async (value) => {
      const repo = repository({
        evaluate: vi.fn().mockResolvedValue([reading(value)]),
      });
      await new InfrastructureService(
        repo,
        { sendAlert: vi.fn() },
        () => at,
      ).runCheck();
      expect(repo.enforceCapacity).toHaveBeenCalledWith(value);
    },
  );
  it("does not let Brevo exhaustion drive capacity pausing", async () => {
    const repo = repository({
      evaluate: vi.fn().mockResolvedValue([reading(99, "BREVO")]),
    });
    await new InfrastructureService(
      repo,
      { sendAlert: vi.fn() },
      () => at,
    ).runCheck();
    expect(repo.enforceCapacity).not.toHaveBeenCalled();
  });
  it("marks failed alert delivery for bounded repository retry and never includes readings in the safe error", async () => {
    const latch = {
      provider: "NETLIFY",
      quota: "CREDITS",
      period: "2026-08",
      threshold: 95,
    };
    const repo = repository({
      reserveThresholds: vi.fn().mockResolvedValue([latch]),
    });
    await new InfrastructureService(
      repo,
      {
        sendAlert: vi.fn().mockRejectedValue(new Error("respondent plaintext")),
      },
      () => at,
    ).runCheck();
    expect(repo.markAlertsFailed).toHaveBeenCalledWith(
      [latch],
      "Infrastructure alert delivery failed.",
    );
    expect(repo.markAlertsSent).not.toHaveBeenCalled();
  });
});
