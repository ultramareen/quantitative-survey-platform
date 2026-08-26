CREATE TABLE "results_snapshots" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "snapshot_number" INT4 NOT NULL,
  "data_cutoff_system_time" STRING(64) NOT NULL,
  "data_cutoff_at" TIMESTAMPTZ(6) NOT NULL,
  "opened_count" INT4 NOT NULL,
  "identified_count" INT4 NOT NULL,
  "started_count" INT4 NOT NULL,
  "greater_than_half_count" INT4 NOT NULL,
  "completed_count" INT4 NOT NULL,
  "aggregate_results" JSONB NOT NULL,
  "free_text_ciphertext" BYTES,
  "free_text_nonce" BYTES,
  "free_text_key_version" INT4,
  "schema_version" INT4 NOT NULL,
  "source_fingerprint" BYTES,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "results_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "results_snapshots_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "results_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "results_snapshots_number_version_check" CHECK ("snapshot_number" >= 1 AND "schema_version" >= 1),
  CONSTRAINT "results_snapshots_counts_check" CHECK ("opened_count" >= 0 AND "identified_count" >= 0 AND "started_count" >= 0 AND "greater_than_half_count" >= 0 AND "completed_count" >= 0),
  CONSTRAINT "results_snapshots_free_text_envelope_check" CHECK (("free_text_ciphertext" IS NULL AND "free_text_nonce" IS NULL AND "free_text_key_version" IS NULL) OR ("free_text_ciphertext" IS NOT NULL AND "free_text_nonce" IS NOT NULL AND "free_text_key_version" IS NOT NULL))
);

CREATE INDEX "results_snapshots_survey_latest_idx" ON "results_snapshots"("survey_id", "created_at" DESC);
CREATE UNIQUE INDEX "results_snapshots_survey_snapshot_number_key" ON "results_snapshots"("survey_id", "snapshot_number");
