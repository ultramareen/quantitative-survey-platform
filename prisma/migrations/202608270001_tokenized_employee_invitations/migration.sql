ALTER TYPE "InvitationStatus" RENAME VALUE 'PENDING' TO 'INVITED';

ALTER TABLE "employee_invitations" ADD COLUMN "token_hash" BYTES;
ALTER TABLE "employee_invitations" ADD COLUMN "token_expires_at" TIMESTAMPTZ(6);

-- Phase 4 was not deployed before this amendment. If a legacy pending row exists,
-- give it an undisclosed, already-expired sentinel so it cannot become usable
-- without an explicit resend that rotates both fields.
UPDATE "employee_invitations"
SET "token_hash" = decode(sha256(gen_random_uuid()::STRING::BYTES), 'hex'),
    "token_expires_at" = "created_at"
WHERE "status" = 'INVITED';

CREATE UNIQUE INDEX "employee_invitations_token_hash_key"
ON "employee_invitations"("token_hash");

ALTER TABLE "employee_invitations"
ADD CONSTRAINT "employee_invitations_token_lifecycle_check" CHECK (
  ("status" = 'INVITED' AND "token_hash" IS NOT NULL AND "token_expires_at" IS NOT NULL)
  OR ("status" IN ('REGISTERED', 'DISABLED') AND "token_hash" IS NULL AND "token_expires_at" IS NULL)
);
