import "server-only";

import { QUOTA_LIMITS } from "./constants";

export type NetlifyEstimateInput = {
  dynamicRequests: number;
  sampledExecutionMillis: number;
  sampledResponseBytes: number;
  sampledRequestCount: number;
  staticRequestMultiplier: number;
  productionDeployments: number;
};

export function estimateNetlifyCredits(input: NetlifyEstimateInput) {
  const sampleCount = Math.max(1, input.sampledRequestCount);
  const averageMillis = input.sampledExecutionMillis / sampleCount;
  const averageBytes = input.sampledResponseBytes / sampleCount;
  const staticRequests = Math.ceil(
    input.dynamicRequests * Math.max(0, input.staticRequestMultiplier),
  );
  const totalRequests = input.dynamicRequests + staticRequests;
  const requestCredits = (totalRequests / 10_000) * 2;
  const computeCredits =
    ((input.dynamicRequests * averageMillis) / 3_600_000) * 10;
  const bandwidthCredits = ((totalRequests * averageBytes) / 1024 ** 3) * 20;
  const deploymentCredits = input.productionDeployments * 15;
  return {
    requestCredits,
    computeCredits,
    bandwidthCredits,
    deploymentCredits,
    totalCredits:
      requestCredits + computeCredits + bandwidthCredits + deploymentCredits,
    limitCredits: QUOTA_LIMITS.NETLIFY_CREDITS,
  };
}

export function percent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0)
    throw new Error("Usage values must be finite and the limit positive.");
  return Math.max(0, (used / limit) * 100);
}

export function estimateCockroach(input: {
  sampledRu: number;
  calibrationMultiplier: number;
  observedStorageBytes: number;
  storageMultiplier: number;
}) {
  return {
    ru: Math.max(0, input.sampledRu * input.calibrationMultiplier),
    storageBytes: Math.max(
      0,
      input.observedStorageBytes * input.storageMultiplier,
    ),
  };
}
