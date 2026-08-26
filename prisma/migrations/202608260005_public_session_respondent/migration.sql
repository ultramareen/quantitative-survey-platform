CREATE TYPE "PublicSessionCreationStatus" AS ENUM ('ACTIVE', 'PENDING_CAPACITY');

CREATE TABLE "public_survey_sessions" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "respondent_id" UUID,
  "open_token_hash" BYTES NOT NULL,
  "created_while_status" "PublicSessionCreationStatus" NOT NULL,
  "first_opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
  "invalidated_at" TIMESTAMPTZ(6),
  CONSTRAINT "public_survey_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_survey_sessions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "public_survey_sessions_seen_order_check" CHECK ("last_seen_at" >= "first_opened_at")
);

CREATE UNIQUE INDEX "public_survey_sessions_open_token_hash_key" ON "public_survey_sessions"("open_token_hash");
CREATE INDEX "public_survey_sessions_survey_opened_idx" ON "public_survey_sessions"("survey_id", "first_opened_at");
CREATE INDEX "public_survey_sessions_respondent_id_idx" ON "public_survey_sessions"("respondent_id");
CREATE UNIQUE INDEX "public_survey_sessions_id_survey_id_key" ON "public_survey_sessions"("id", "survey_id");

CREATE TABLE "respondents" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "reference_id" STRING(15) NOT NULL,
  "name_ciphertext" BYTES,
  "name_nonce" BYTES,
  "name_key_version" INT4,
  "phone_ciphertext" BYTES,
  "phone_nonce" BYTES,
  "phone_key_version" INT4,
  "phone_lookup_hash" BYTES,
  "phone_lookup_key_version" INT4,
  "identified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
  "anonymized_at" TIMESTAMPTZ(6),
  "retention_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "respondents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "respondents_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "respondents_reference_id_format_check" CHECK ("reference_id" ~ '^R-[0-9A-HJKMNP-TV-Z]{12}$'),
  CONSTRAINT "respondents_envelope_check" CHECK (
    ("anonymized_at" IS NULL AND "name_ciphertext" IS NOT NULL AND "name_nonce" IS NOT NULL AND "name_key_version" IS NOT NULL AND "phone_ciphertext" IS NOT NULL AND "phone_nonce" IS NOT NULL AND "phone_key_version" IS NOT NULL AND "phone_lookup_hash" IS NOT NULL AND "phone_lookup_key_version" IS NOT NULL)
    OR ("anonymized_at" IS NOT NULL AND "name_ciphertext" IS NULL AND "name_nonce" IS NULL AND "name_key_version" IS NULL AND "phone_ciphertext" IS NULL AND "phone_nonce" IS NULL AND "phone_key_version" IS NULL AND "phone_lookup_hash" IS NULL AND "phone_lookup_key_version" IS NULL)
  ),
  CONSTRAINT "respondents_activity_order_check" CHECK ("last_activity_at" >= "identified_at")
);

CREATE UNIQUE INDEX "respondents_reference_id_key" ON "respondents"("reference_id");
CREATE INDEX "respondents_survey_identified_idx" ON "respondents"("survey_id", "identified_at");
CREATE UNIQUE INDEX "respondents_id_survey_id_key" ON "respondents"("id", "survey_id");

ALTER TABLE "public_survey_sessions" ADD CONSTRAINT "public_survey_sessions_respondent_id_survey_id_fkey" FOREIGN KEY ("respondent_id", "survey_id") REFERENCES "respondents"("id", "survey_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
