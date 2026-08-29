# Backup and restore runbook

This is a controlled-machine procedure. Never run it from Netlify, preview, an application request, or a developer machine containing real data without written authorization.

## Ownership and recovery objectives

- Name a primary and secondary custodian before production. Record their names in the company-controlled operations register, not this repository.
- Both custodians retain the application key versions needed by retained archives. The backup encryption key is held separately from both the encrypted archives and ordinary application runtime.
- Recovery point objective (RPO): 24 hours, bounded by the approximately daily Cockroach Basic managed backup plus the latest independent monthly/pre-migration archive.
- Recovery time objective (RTO): record the measured result of each drill; the launch target is one business day. Escalate rather than silently changing this target.
- Retain three rolling monthly independent copies plus the relevant pre-migration copy. Store only in approved company-controlled encrypted storage already available at zero added cost.

## Managed Cockroach backup check

Before launch and at every quarterly drill, a custodian records non-PII evidence that the Basic console shows the expected approximately 24-hour backup, 30-day retention, single-region location, and restore-to-empty-target constraint. Provider behavior is authoritative and may change. A Basic restore target must be completely empty, in the same organization, and is unavailable/overwritten during restore.

## Independent backup

1. Before every risky schema/data migration and monthly, use Cockroach's current provider-supported logical export procedure from the controlled machine with a narrowly privileged maintenance credential. Do not hard-code a provider command that may become obsolete; record its version and invocation in the operations register.
2. Package the complete logical export and its non-secret manifest into one archive.
3. Set `BACKUP_ENCRYPTION_KEY` only in the controlled shell. It must be canonical base64 for 32 random bytes and must not be written to shell history, Git, Netlify, preview, the database, or beside the archive.
4. Run `pnpm backup:archive encrypt <logical-archive> <encrypted-archive>`. The output is mode `0600`, uses AES-256-GCM authenticated encryption, and contains no plaintext copy created by the tool.
5. Inspect the logical archive before deleting its temporary plaintext: confirm the expected schema/data entries exist and search for prohibited plaintext synthetic canaries. Database dumps necessarily expose employee identity, instrument text, numeric aggregates, metadata and keyed hashes, so the whole archive—not selected files—must be encrypted.
6. Move the encrypted archive to approved storage, record its SHA-256 digest, tool/provider version, timestamp, custodian, and reason without PII, then securely remove the temporary plaintext using the controlled machine's approved media procedure.

Never store archives in Git, Netlify assets, public buckets, or unapproved personal cloud drives.

## Isolated restore drill

Repeat quarterly and after material backup-tool/provider changes.

1. Create an empty nonproduction Cockroach Basic target in the same organization with isolated restore credentials. It must contain synthetic data only for rehearsals.
2. Copy one encrypted archive to the isolated controlled machine. Set the separately held key and run `pnpm backup:archive decrypt <encrypted-archive> <logical-archive>`.
3. Restore with the current provider-supported procedure. Point neither production nor preview traffic at this target.
4. Set `RESTORE_DATABASE_URL` to the isolated target and run `pnpm restore:verify`. Verify applied migrations, required table counts, CURRENT/ARCHIVED attempt integrity, and snapshot fingerprints.
5. Start the application using isolated restored credentials and the retained application key versions. As an authorized Researcher/Admin, decrypt one explicitly synthetic respondent and verify survey, PublicSurveySession, Respondent, CURRENT/ARCHIVED attempt, and ResultsSnapshot behavior.
6. Record actual RPO, RTO, archive digest, checks performed, pass/fail, and custodians without PII.
7. Securely remove decrypted material, revoke credentials, and destroy the restore environment. Confirm destruction in the operations register.

Any authentication failure, missing key version, schema mismatch, plaintext leak, or integrity failure blocks release.
