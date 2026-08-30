import "server-only";

import { z } from "zod";

const EVIDENCE_KEYS = new Set([
  "passed",
  "checkedAt",
  "custodian",
  "safeReference",
]);
const evidenceItem = z.object({
  passed: z.literal(true),
  checkedAt: z.iso.datetime(),
  custodian: z.string().min(1).max(200),
  safeReference: z.string().min(1).max(500),
});

export const productionReleaseEvidenceSchema = z
  .object({
    environment: z.literal("production"),
    syntheticOnly: z.literal(true),
    netlifyFreeNoRecharge: evidenceItem,
    cockroachZeroDollarLimit: evidenceItem,
    brevoFreeAndSenderVerified: evidenceItem,
    nativeProviderAlerts: evidenceItem,
    scheduledFunctionDelivery: evidenceItem,
    previewSmoke: evidenceItem,
    productionSyntheticSmoke: evidenceItem,
    migrationRehearsal: evidenceItem,
    restoreDrill: evidenceItem,
    capacityLoadGate: evidenceItem,
    authorizationNegativeGate: evidenceItem,
    smokeDataRemoved: evidenceItem,
    finalApproval: evidenceItem,
  })
  .strict();

export function validateProductionReleaseEvidence(
  input: unknown,
  now = new Date(),
) {
  assertNoNestedEvidenceFields(input);
  const evidence = productionReleaseEvidenceSchema.parse(input);
  const oldestAllowed = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  for (const [name, item] of Object.entries(evidence)) {
    if (typeof item !== "object" || !("checkedAt" in item)) continue;
    const checkedAt = Date.parse(String(item.checkedAt));
    if (checkedAt < oldestAllowed || checkedAt > now.getTime() + 5 * 60_000)
      throw new Error(`Release evidence is stale or future-dated: ${name}`);
  }
  return evidence;
}

function assertNoNestedEvidenceFields(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const value of Object.values(input)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const key of Object.keys(value))
      if (!EVIDENCE_KEYS.has(key))
        throw new Error(`Unexpected release-evidence field: ${key}`);
  }
}
