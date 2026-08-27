# Quantitative Survey Platform

Approved Phase 0–3 foundation for the quantitative survey platform.

## Local setup

1. Use Node.js 20.9 or newer and pnpm 11.
2. Copy `.env.example` to `.env.local` and replace every placeholder with local-only synthetic values.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm dev`.

Development uses `MAIL_TRANSPORT=local-file`; password-reset messages are
written to the ignored, local-only path in `LOCAL_MAILBOX_PATH`. Preview and
production fail closed unless `MAIL_TRANSPORT=resend` and deployment-managed
Resend credentials are present.

## Initial Admin bootstrap

After applying the existing migrations to an empty database, create the first
Admin from a trusted server terminal. Use synthetic local values during
development and do not save the password in a checked-in environment file:

```sh
QSP_BOOTSTRAP_EMAIL=admin@synthetic.invalid \
QSP_BOOTSTRAP_DISPLAY_NAME="Synthetic Admin" \
QSP_BOOTSTRAP_PASSWORD="replace-with-a-local-password" \
pnpm auth:bootstrap
```

The command refuses to run once any user exists and records a safe audit event.
There is no public bootstrap, registration, or employee invitation endpoint in
Phase 3.

`pnpm dev`, `pnpm build`, and `pnpm start` validate required server configuration before starting. Missing or malformed values fail closed without printing secret contents.

The three source-of-truth files under `docs/` are protected by `.frozen-docs.sha256`. Formatting, linting, and verification commands fail closed if any frozen byte changes, and automatic format/fix scopes exclude `docs/**`.

## Verification

Run `pnpm verify` to execute type checking, linting, formatting, unit and architecture tests, Prisma configuration validation, the production build, and the client-bundle secret scan.

Survey authoring, invitations, respondent flows, results, exports, and
infrastructure quota protection remain deferred to their approved later phases.
