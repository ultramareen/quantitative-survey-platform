# Auth module

Phase 3 implements self-hosted employee authentication through a Better Auth
plugin boundary while preserving the frozen CockroachDB schema. Passwords use
the central Argon2id primitive; only hashes of 256-bit session and reset tokens
are persisted. Authorization policies live in `policies.ts` and must be applied
server-side even when the UI also hides an unavailable action.

Open registration is disabled. The initial Admin is created exactly once with
the non-public `pnpm auth:bootstrap` command. Normal employee invitation and
registration remain Phase 4 work.
