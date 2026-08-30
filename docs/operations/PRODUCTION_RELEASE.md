# Production release runbook

This runbook implements the Phase 14 gate. It does not itself authorize a deployment. Store account screenshots, provider exports, custodian names, and signed approval in the approved company-controlled operations register; keep only safe references out of Git.

## Current provider baseline

Reverified 29 August 2026 against official provider sources:

- Netlify Free lists 300 monthly credits. Current credit accounting remains 15 per successful production deploy, 10 per GB-hour compute, 20 per GB bandwidth, and 2 per 10,000 web requests. Auto-recharge is unavailable on Free and must remain disabled if the account plan changes: <https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/>.
- CockroachDB Basic lists the first 50 million RUs and 10 GiB storage free each month and says no credit card is required. The actual organization must still visibly show no payment method or an exact `$0` limit: <https://www.cockroachlabs.com/pricing/>.
- Brevo Free lists 300 account-wide email sends per day, resetting daily without rollover, and includes transactional email with no credit card required. Verify the Free/no-payment state, transactional-account activation, individual sender verification, native quota state, compliant sender rewriting and Brevo branding in the actual account: <https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan>.

Provider pages and the actual account console are authoritative. Any changed term or ambiguous `$0` control blocks launch; do not silently substitute a paid product.

## Before deployment

1. Run `pnpm verify` with synthetic configuration. It includes frozen-document validation, type/lint/format checks, the full unit/architecture suite, two deterministic fresh migration rehearsals and database integration suites, production configuration validation, production build, client-bundle secret scan, and whole-build source-map/configured-secret scan.
2. Run the complete role/public lifecycle smoke matrix with synthetic records in preview: Product Manager, Researcher, Admin, first/same/new-device respondent, locked, PENDING, COMPLETED, results, aggregate/current/archive/free-text XLSX, Product Manager direct PII denials, capacity pause/switch, scheduled alert delivery, and production-safe error/unavailable states.
3. Record migration review, preview URL, commit hash, timestamps, pass/fail, and safe log references. Preview must use unrelated database credentials and cryptographic keys, contain synthetic data only, and must not receive `BACKUP_ENCRYPTION_KEY`.

## Production configuration

- Use production-only `DATABASE_URL`, auth/session secret, versioned PII and phone-HMAC keys, rate-limit HMAC key, Brevo API key and individually verified sender email/name, canonical HTTPS `APP_ORIGIN`, and a random `QSP_SMOKE_TOKEN` of at least 32 characters.
- Keep runtime, migration, and maintenance database credentials separate. Keep preview and production credentials/keys unrelated.
- Confirm Netlify Free and no recharge/paid upgrade; Cockroach no payment method or a current exact `$0` limit; Brevo Free with no payment method, paid plan or add-on; native notices; scheduled three-hour check; single-region Cockroach `aws-us-east-1`; and real delivery from the individually verified sender to representative mailbox providers. Record rewritten sender identity, authentication results, inbox/spam placement, Brevo branding, quota behavior and absence of a delivery SLA. A company-controlled domain is not required.
- `/api/health` is a detail-free liveness response. `/api/smoke` requires `Authorization: Bearer <QSP_SMOKE_TOKEN>`, checks the database, returns only `ok` or `unavailable`, and is never linked in UI.

## Controlled deployment sequence

Follow frozen Implementation Plan Section J exactly: backup decision, reviewed migration, constraint verification, one production deployment, bootstrap, scheduled/native alerts, synthetic smoke, restore/decryption drill, authorization/lifecycle/autosave/XLSX/capacity gates, and synthetic cleanup. Record measured load, RPO/RTO, provider readings, and alert delivery without PII.

Create a company-controlled JSON evidence record matching the fields enforced by `pnpm release:evidence <path>`. Every item must be `passed: true`, checked within seven days, and reference non-PII evidence. The record includes explicit final approval and synthetic smoke-data removal. Never put the evidence file, tokens, credentials, screenshots, or real PII in Git.

The first production survey may be created and activated only after `release:evidence` passes and the authorized approver gives final approval. A successful build or deployment alone is not authorization.
