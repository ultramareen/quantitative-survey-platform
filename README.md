# Quantitative Survey Platform

Phase 0 engineering foundation for the approved quantitative survey platform.

## Local setup

1. Use Node.js 20.9 or newer and pnpm 11.
2. Copy `.env.example` to `.env.local` and replace every placeholder with local-only synthetic values.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm dev`.

`pnpm dev`, `pnpm build`, and `pnpm start` validate required server configuration before starting. Missing or malformed values fail closed without printing secret contents.

The three source-of-truth files under `docs/` are protected by `.frozen-docs.sha256`. Formatting, linting, and verification commands fail closed if any frozen byte changes, and automatic format/fix scopes exclude `docs/**`.

## Phase 0 checks

Run `pnpm verify` to execute type checking, linting, formatting, unit and architecture tests, Prisma configuration validation, the production build, and the client-bundle secret scan.

No product schema, database migration, authentication, encryption, survey, respondent, result, export, or infrastructure-quota functionality is implemented in Phase 0.
