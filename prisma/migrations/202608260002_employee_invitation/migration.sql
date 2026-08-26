CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'REGISTERED', 'DISABLED');

CREATE TABLE "employee_invitations" (
  "id" UUID NOT NULL,
  "email_normalized" STRING(320) NOT NULL,
  "assigned_role" "EmployeeRole" NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "registered_user_id" UUID,
  "invited_by_id" UUID NOT NULL,
  "disabled_by_id" UUID,
  "registered_at" TIMESTAMPTZ(6),
  "disabled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_invitations_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "employee_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "employee_invitations_disabled_by_id_fkey" FOREIGN KEY ("disabled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "employee_invitations_lifecycle_check" CHECK (
    ("status" = 'PENDING' AND "registered_user_id" IS NULL AND "registered_at" IS NULL AND "disabled_at" IS NULL AND "disabled_by_id" IS NULL)
    OR ("status" = 'REGISTERED' AND "registered_user_id" IS NOT NULL AND "registered_at" IS NOT NULL AND "disabled_at" IS NULL AND "disabled_by_id" IS NULL)
    OR ("status" = 'DISABLED' AND "disabled_at" IS NOT NULL AND "disabled_by_id" IS NOT NULL AND (("registered_user_id" IS NULL AND "registered_at" IS NULL) OR ("registered_user_id" IS NOT NULL AND "registered_at" IS NOT NULL)))
  )
);

CREATE UNIQUE INDEX "employee_invitations_email_normalized_key" ON "employee_invitations"("email_normalized");
CREATE UNIQUE INDEX "employee_invitations_registered_user_id_key" ON "employee_invitations"("registered_user_id");
CREATE INDEX "employee_invitations_status_idx" ON "employee_invitations"("status");
