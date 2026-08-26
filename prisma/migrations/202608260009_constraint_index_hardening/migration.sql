-- Prisma cannot express these CockroachDB partial unique indexes in the schema
-- without making their predicates invisible to introspection. They are kept in
-- reviewed SQL and covered by live database tests.
CREATE UNIQUE INDEX "respondents_survey_phone_lookup_hash_current_key"
  ON "respondents"("survey_id", "phone_lookup_hash")
  WHERE "phone_lookup_hash" IS NOT NULL;

CREATE UNIQUE INDEX "response_attempts_one_current_per_respondent_key"
  ON "response_attempts"("respondent_id")
  WHERE "status" = 'CURRENT';

-- Non-partial indexes supporting exact lookup and expiry/reconciliation paths.
CREATE INDEX "respondents_reference_id_idx" ON "respondents"("reference_id");
CREATE INDEX "response_attempts_respondent_status_idx" ON "response_attempts"("respondent_id", "status");
