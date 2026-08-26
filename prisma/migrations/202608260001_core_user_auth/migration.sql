CREATE TYPE "EmployeeRole" AS ENUM ('PRODUCT_MANAGER', 'RESEARCHER', 'ADMIN');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email_normalized" STRING(320) NOT NULL,
  "display_name" STRING(200) NOT NULL,
  "email_verified" BOOL NOT NULL DEFAULT false,
  "role" "EmployeeRole" NOT NULL,
  "authorization_version" INT4 NOT NULL DEFAULT 1,
  "disabled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_authorization_version_check" CHECK ("authorization_version" >= 1)
);

CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");
CREATE INDEX "users_disabled_at_idx" ON "users"("disabled_at");

CREATE TABLE "auth_accounts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "issuer" STRING(100) NOT NULL DEFAULT 'local',
  "provider_id" STRING(100) NOT NULL DEFAULT 'credential',
  "account_id" STRING(320) NOT NULL,
  "password_hash" STRING(512) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");
CREATE UNIQUE INDEX "auth_accounts_issuer_account_id_key" ON "auth_accounts"("issuer", "account_id");

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" BYTES NOT NULL,
  "authorization_version" INT4 NOT NULL,
  "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "auth_sessions_expiry_order_check" CHECK ("idle_expires_at" <= "absolute_expires_at"),
  CONSTRAINT "auth_sessions_authorization_version_check" CHECK ("authorization_version" >= 1)
);

CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_revoked_idx" ON "auth_sessions"("user_id", "revoked_at");
CREATE INDEX "auth_sessions_idle_expires_at_idx" ON "auth_sessions"("idle_expires_at");
CREATE INDEX "auth_sessions_absolute_expires_at_idx" ON "auth_sessions"("absolute_expires_at");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" BYTES NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "password_reset_tokens_used_at_check" CHECK ("used_at" IS NULL OR "used_at" >= "created_at")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
