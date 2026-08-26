CREATE TYPE "ResponseAttemptStatus" AS ENUM ('CURRENT', 'ARCHIVED');
CREATE TYPE "ResponseArchiveReason" AS ENUM ('REPLACED', 'SECURITY_REVOKED', 'RETENTION');

CREATE TABLE "response_attempts" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "respondent_id" UUID NOT NULL,
  "public_survey_session_id" UUID NOT NULL,
  "status" "ResponseAttemptStatus" NOT NULL DEFAULT 'CURRENT',
  "generation" INT4 NOT NULL,
  "attempt_number" INT4 NOT NULL,
  "attempt_token_hash" BYTES,
  "payload_ciphertext" BYTES NOT NULL,
  "payload_nonce" BYTES NOT NULL,
  "payload_key_version" INT4 NOT NULL,
  "payload_schema_version" INT4 NOT NULL,
  "revision" INT4 NOT NULL DEFAULT 0,
  "last_mutation_id" UUID,
  "save_count" INT4 NOT NULL DEFAULT 0,
  "answered_question_count" INT2 NOT NULL DEFAULT 0,
  "coverage_basis_count" INT2 NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
  "last_answer_changed_at" TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6),
  "archive_reason" "ResponseArchiveReason",
  CONSTRAINT "response_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "response_attempts_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "response_attempts_respondent_id_survey_id_fkey" FOREIGN KEY ("respondent_id", "survey_id") REFERENCES "respondents"("id", "survey_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "response_attempts_public_survey_session_id_survey_id_fkey" FOREIGN KEY ("public_survey_session_id", "survey_id") REFERENCES "public_survey_sessions"("id", "survey_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "response_attempts_status_archive_check" CHECK (("status" = 'CURRENT' AND "archived_at" IS NULL AND "archive_reason" IS NULL) OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL AND "archive_reason" IS NOT NULL)),
  CONSTRAINT "response_attempts_counts_check" CHECK ("generation" >= 1 AND "attempt_number" >= 1 AND "revision" >= 0 AND "save_count" >= 0 AND "answered_question_count" BETWEEN 0 AND 50 AND "coverage_basis_count" BETWEEN 1 AND 50 AND "answered_question_count" <= "coverage_basis_count"),
  CONSTRAINT "response_attempts_versions_check" CHECK ("payload_key_version" >= 1 AND "payload_schema_version" >= 1),
  CONSTRAINT "response_attempts_activity_order_check" CHECK ("last_activity_at" >= "created_at" AND ("started_at" IS NULL OR "started_at" >= "created_at") AND ("last_answer_changed_at" IS NULL OR "last_answer_changed_at" >= "created_at"))
);

CREATE UNIQUE INDEX "response_attempts_attempt_token_hash_key" ON "response_attempts"("attempt_token_hash");
CREATE INDEX "response_attempts_survey_status_idx" ON "response_attempts"("survey_id", "status");
CREATE INDEX "response_attempts_public_session_idx" ON "response_attempts"("public_survey_session_id");
CREATE UNIQUE INDEX "response_attempts_respondent_attempt_number_key" ON "response_attempts"("respondent_id", "attempt_number");
