# Database privilege expectations

This Phase 1 document defines the least-privilege contract. It does not create production users, credentials, or grants. Concrete CockroachDB Cloud identities and grants are intentionally deferred until the deployment environment exists; that work must be tested before production use.

## Migration identity

- Used only by reviewed migration and controlled recovery workflows.
- May create and alter application schema objects and manage grants.
- Is never available to the application runtime or browser.
- Migration SQL is reviewed before execution and every deployed migration is retained in source control.
- Prisma migration commands use the dedicated `MIGRATION_DATABASE_URL`, never the runtime `DATABASE_URL`.
- `MIGRATION_DATABASE_URL` must include the PostgreSQL startup option `options=-c create_table_with_schema_locked=off` (URL-encoded as `options=-c%20create_table_with_schema_locked%3Doff`). This prevents CockroachDB 26 schema locks from racing Prisma's separate DDL statements without changing migration SQL or the final relational schema.
- Local development, CI, fresh-database tests, and production deployment run `pnpm db:migrate` with this migration-only connection. Production uses the separately provisioned migration identity in the URL; real credentials remain in the deployment secret store and must never be committed.

## Runtime identity

- May connect and perform only the row operations required by application services.
- Uses `DATABASE_URL`, which must not contain the migration-only `create_table_with_schema_locked` option.
- Must not create, alter, or drop schemas, tables, types, indexes, constraints, roles, or grants.
- Must not update or delete `results_snapshots`; snapshots are insert-only and existing rows are immutable.
- Must not perform maintenance-only bulk decryption, key rotation, backup, restore, or retention operations.
- All operations run under CockroachDB's serializable transaction semantics; retryable serialization failures use bounded application retries.

## Maintenance identity

- Separate from runtime and migration identities.
- Receives only the narrowly scoped privileges required for an approved maintenance operation, such as resumable re-encryption, retention/anonymization, logical backup, or restore verification.
- Is not used for ordinary web requests and is not distributed to preview environments.

## Enforcement status

The migration tests in Phase 1 verify this documented contract and verify that migrations do not create placeholder production roles or embed credentials. Database-level runtime `results_snapshots` grant enforcement is deferred until real environment identities can be created safely. It becomes a mandatory integration test before the runtime identity is approved for production in Phase 9. No production account is provisioned in Phase 1.
