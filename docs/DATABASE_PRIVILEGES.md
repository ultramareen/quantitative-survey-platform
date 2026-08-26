# Database privilege expectations

This Phase 1 document defines the least-privilege contract. It does not create production users, credentials, or grants. Concrete CockroachDB Cloud identities and grants are intentionally deferred until the deployment environment exists; that work must be tested before production use.

## Migration identity

- Used only by reviewed migration and controlled recovery workflows.
- May create and alter application schema objects and manage grants.
- Is never available to the application runtime or browser.
- Migration SQL is reviewed before execution and every deployed migration is retained in source control.

## Runtime identity

- May connect and perform only the row operations required by application services.
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
