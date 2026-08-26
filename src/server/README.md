# Server boundary

Everything under `src/server` is server-only. Client-safe components must not import this tree. Sensitive values are parsed and consumed only through this boundary; only explicitly named `NEXT_PUBLIC_*` values may enter browser code.

Mutation routes added in approved later phases must apply same-origin/Fetch Metadata checks through the central CSRF helper before processing state changes. Authentication-specific CSRF behavior remains deferred to the authentication phase.
