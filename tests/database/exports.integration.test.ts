import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { ExportRepository } from "@/server/modules/exports/repository";

const { Pool } = pg;
const missingSurveyId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("Phase 11 export repository contracts", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new ExportRepository(pool);

  afterAll(async () => pool.end());

  it.each(["CURRENT", "ARCHIVED"] as const)(
    "uses a valid status-separated CockroachDB size estimate for %s attempts",
    async (status) => {
      await expect(
        repository.attemptEstimate(missingSurveyId, status),
      ).resolves.toEqual({ count: 0, payload_bytes: 0 });
    },
  );

  it("returns no rows for a missing, non-public survey without exposing internals", async () => {
    await expect(repository.survey(missingSurveyId)).resolves.toBeNull();
    await expect(repository.questions(missingSurveyId)).resolves.toEqual([]);
  });
});
