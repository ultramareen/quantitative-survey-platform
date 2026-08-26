CREATE TYPE "InfrastructureUsageSource" AS ENUM ('ESTIMATED', 'MANUAL_ACTUAL', 'PROVIDER_ACTUAL');
CREATE TYPE "InfrastructureAlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "InfrastructureProtectionState" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

CREATE TABLE "infrastructure_usage_snapshots" (
  "id" UUID NOT NULL,
  "provider" STRING(64) NOT NULL,
  "quota_key" STRING(128) NOT NULL,
  "period_key" STRING(64) NOT NULL,
  "used_units" DECIMAL(30,9) NOT NULL,
  "limit_units" DECIMAL(30,9) NOT NULL,
  "usage_percent" DECIMAL(8,4) NOT NULL,
  "source" "InfrastructureUsageSource" NOT NULL,
  "safe_details" JSONB,
  "collected_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "infrastructure_usage_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "infrastructure_usage_values_check" CHECK ("used_units" >= 0 AND "limit_units" > 0 AND "usage_percent" >= 0)
);

CREATE INDEX "infrastructure_usage_latest_idx" ON "infrastructure_usage_snapshots"("provider", "quota_key", "collected_at" DESC);

CREATE TABLE "infrastructure_estimate_buckets" (
  "id" UUID NOT NULL,
  "provider" STRING(64) NOT NULL,
  "quota_key" STRING(128) NOT NULL,
  "period_key" STRING(64) NOT NULL,
  "bucket_started_at" TIMESTAMPTZ(6) NOT NULL,
  "request_count" INT8 NOT NULL DEFAULT 0,
  "execution_millis" DECIMAL(30,3) NOT NULL DEFAULT 0,
  "response_bytes" INT8 NOT NULL DEFAULT 0,
  "estimated_units" DECIMAL(30,9) NOT NULL DEFAULT 0,
  "estimator_version" INT4 NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "infrastructure_estimate_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "infrastructure_estimate_values_check" CHECK ("request_count" >= 0 AND "execution_millis" >= 0 AND "response_bytes" >= 0 AND "estimated_units" >= 0 AND "estimator_version" >= 1)
);

CREATE UNIQUE INDEX "infrastructure_estimate_bucket_key" ON "infrastructure_estimate_buckets"("provider", "quota_key", "period_key", "bucket_started_at");

CREATE TABLE "infrastructure_deployments" (
  "id" UUID NOT NULL,
  "provider" STRING(64) NOT NULL,
  "provider_deployment_id" STRING(255) NOT NULL,
  "production" BOOL NOT NULL DEFAULT false,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "infrastructure_deployments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "infrastructure_deployment_production_idx" ON "infrastructure_deployments"("production", "observed_at" DESC);
CREATE UNIQUE INDEX "infrastructure_deployment_provider_key" ON "infrastructure_deployments"("provider", "provider_deployment_id");

CREATE TABLE "infrastructure_alert_deliveries" (
  "id" UUID NOT NULL,
  "provider" STRING(64) NOT NULL,
  "quota_key" STRING(128) NOT NULL,
  "period_key" STRING(64) NOT NULL,
  "threshold" INT2 NOT NULL,
  "status" "InfrastructureAlertStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INT4 NOT NULL DEFAULT 0,
  "safe_last_error" STRING(1000),
  "last_attempt_at" TIMESTAMPTZ(6),
  "sent_at" TIMESTAMPTZ(6),
  "sent_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "infrastructure_alert_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "infrastructure_alert_deliveries_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "infrastructure_alert_threshold_check" CHECK ("threshold" BETWEEN 0 AND 100 AND "attempt_count" >= 0),
  CONSTRAINT "infrastructure_alert_sent_check" CHECK (("status" = 'SENT' AND "sent_at" IS NOT NULL) OR ("status" <> 'SENT' AND "sent_at" IS NULL))
);

CREATE INDEX "infrastructure_alert_delivery_retry_idx" ON "infrastructure_alert_deliveries"("status", "last_attempt_at");
CREATE UNIQUE INDEX "infrastructure_alert_delivery_latch_key" ON "infrastructure_alert_deliveries"("provider", "quota_key", "period_key", "threshold");

CREATE TABLE "infrastructure_control_state" (
  "singleton_key" STRING(32) NOT NULL DEFAULT 'global',
  "protection_state" "InfrastructureProtectionState" NOT NULL DEFAULT 'NORMAL',
  "effective_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "effective_provider" STRING(64),
  "effective_quota_key" STRING(128),
  "effective_source" "InfrastructureUsageSource",
  "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
  "last_reconciled_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "infrastructure_control_state_pkey" PRIMARY KEY ("singleton_key"),
  CONSTRAINT "infrastructure_control_singleton_check" CHECK ("singleton_key" = 'global'),
  CONSTRAINT "infrastructure_control_percent_check" CHECK ("effective_percent" >= 0),
  CONSTRAINT "infrastructure_control_source_check" CHECK (("effective_provider" IS NULL AND "effective_quota_key" IS NULL AND "effective_source" IS NULL) OR ("effective_provider" IS NOT NULL AND "effective_quota_key" IS NOT NULL AND "effective_source" IS NOT NULL))
);

CREATE TABLE "security_rate_limits" (
  "id" UUID NOT NULL,
  "scope" STRING(100) NOT NULL,
  "subject_hash" BYTES NOT NULL,
  "window_start" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "hit_count" INT4 NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_rate_limits_values_check" CHECK ("hit_count" >= 0 AND "expires_at" > "window_start")
);

CREATE INDEX "security_rate_limits_expires_at_idx" ON "security_rate_limits"("expires_at");
CREATE UNIQUE INDEX "security_rate_limits_bucket_key" ON "security_rate_limits"("scope", "subject_hash", "window_start");
