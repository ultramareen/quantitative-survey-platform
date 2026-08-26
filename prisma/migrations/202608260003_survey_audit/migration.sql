CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PENDING_CAPACITY', 'COMPLETED');
CREATE TYPE "SurveyPauseReason" AS ENUM ('MANUAL', 'INFRASTRUCTURE_CAPACITY');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

CREATE TABLE "surveys" (
  "id" UUID NOT NULL,
  "public_id" STRING(64) NOT NULL,
  "owner_id" UUID NOT NULL,
  "title" STRING(300) NOT NULL,
  "description" STRING(4000),
  "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
  "pause_reason" "SurveyPauseReason",
  "state_version" INT4 NOT NULL DEFAULT 1,
  "question_count" INT2 NOT NULL DEFAULT 0,
  "launched_at" TIMESTAMPTZ(6),
  "paused_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "state_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tombstoned_at" TIMESTAMPTZ(6),
  "tombstoned_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "surveys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "surveys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "surveys_tombstoned_by_id_fkey" FOREIGN KEY ("tombstoned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "surveys_question_count_check" CHECK ("question_count" BETWEEN 0 AND 50),
  CONSTRAINT "surveys_state_version_check" CHECK ("state_version" >= 1),
  CONSTRAINT "surveys_tombstone_actor_check" CHECK (("tombstoned_at" IS NULL) = ("tombstoned_by_id" IS NULL)),
  CONSTRAINT "surveys_pause_reason_check" CHECK (("status" = 'PENDING_CAPACITY') = ("pause_reason" IS NOT NULL)),
  CONSTRAINT "surveys_completed_at_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "surveys_public_id_key" ON "surveys"("public_id");
CREATE INDEX "surveys_owner_status_idx" ON "surveys"("owner_id", "status");
CREATE INDEX "surveys_status_tombstoned_idx" ON "surveys"("status", "tombstoned_at");
CREATE INDEX "surveys_tombstoned_at_idx" ON "surveys"("tombstoned_at");

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "survey_id" UUID,
  "action" STRING(160) NOT NULL,
  "target_type" STRING(100),
  "target_id" STRING(128),
  "result" "AuditResult" NOT NULL,
  "affected_rows" INT4,
  "safe_metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "audit_events_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "audit_events_affected_rows_check" CHECK ("affected_rows" IS NULL OR "affected_rows" >= 0)
);

CREATE INDEX "audit_events_actor_created_idx" ON "audit_events"("actor_user_id", "created_at" DESC);
CREATE INDEX "audit_events_survey_created_idx" ON "audit_events"("survey_id", "created_at" DESC);
CREATE INDEX "audit_events_action_created_idx" ON "audit_events"("action", "created_at" DESC);
