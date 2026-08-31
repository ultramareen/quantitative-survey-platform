import { describe, expect, it, vi } from "vitest";
import {
  authorizeSmokeCheck,
  ProductionHealthService,
} from "@/server/modules/infrastructure/health";

describe("production health and smoke checks", () => {
  it("keeps liveness public but authenticates dependency smoke checks", () => {
    const token = "synthetic-smoke-token-at-least-32-characters";
    expect(authorizeSmokeCheck(`Bearer ${token}`, token)).toBe(true);
    expect(authorizeSmokeCheck("Bearer wrong", token)).toBe(false);
    expect(authorizeSmokeCheck(null, token)).toBe(false);
    expect(authorizeSmokeCheck(`Bearer ${token}`, undefined)).toBe(false);
  });

  it("returns only a boolean readiness outcome for database success or failure", async () => {
    const readyPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: true }] }),
    };
    await expect(
      new ProductionHealthService(readyPool as never).ready(),
    ).resolves.toBe(true);
    const failedPool = {
      query: vi.fn().mockRejectedValue(new Error("credential and hostname")),
    };
    await expect(
      new ProductionHealthService(failedPool as never).ready(),
    ).resolves.toBe(false);
  });
});
