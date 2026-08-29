import "server-only";

import type { Pool } from "pg";

const REQUIRED_TABLES = [
  "surveys",
  "public_survey_sessions",
  "respondents",
  "response_attempts",
  "results_snapshots",
] as const;
export type RestoreIntegrityReport = {
  migrations: number;
  counts: Record<(typeof REQUIRED_TABLES)[number], number>;
  currentAttempts: number;
  archivedAttempts: number;
  invalidCurrentRespondents: number;
  snapshotFingerprintFailures: number;
};

export async function verifyRestoredDatabase(
  pool: Pool,
): Promise<RestoreIntegrityReport> {
  const migrations = Number(
    (
      await pool.query(
        "SELECT count(*)::INT4 count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
      )
    ).rows[0]?.count ?? 0,
  );
  const counts = Object.fromEntries(
    await Promise.all(
      REQUIRED_TABLES.map(async (table) => [
        table,
        Number(
          (await pool.query(`SELECT count(*)::INT4 count FROM ${table}`))
            .rows[0]?.count ?? 0,
        ),
      ]),
    ),
  ) as RestoreIntegrityReport["counts"];
  const attempts = (
    await pool.query<{ current_count: number; archived_count: number }>(
      "SELECT count(*) FILTER (WHERE status='CURRENT')::INT4 current_count,count(*) FILTER (WHERE status='ARCHIVED')::INT4 archived_count FROM response_attempts",
    )
  ).rows[0]!;
  const invalidCurrentRespondents = Number(
    (
      await pool.query(
        "SELECT count(*)::INT4 count FROM (SELECT respondent_id FROM response_attempts WHERE status='CURRENT' GROUP BY respondent_id HAVING count(*)<>1) invalid",
      )
    ).rows[0]?.count ?? 0,
  );
  const snapshotFingerprintFailures = Number(
    (
      await pool.query(
        "SELECT count(*)::INT4 count FROM results_snapshots WHERE source_fingerprint IS NULL OR length(source_fingerprint)<>32",
      )
    ).rows[0]?.count ?? 0,
  );
  if (
    migrations < 1 ||
    invalidCurrentRespondents ||
    snapshotFingerprintFailures
  )
    throw new Error("Restored database integrity verification failed.");
  return {
    migrations,
    counts,
    currentAttempts: Number(attempts.current_count),
    archivedAttempts: Number(attempts.archived_count),
    invalidCurrentRespondents,
    snapshotFingerprintFailures,
  };
}
