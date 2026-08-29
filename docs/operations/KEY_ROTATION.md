# Encryption-key rotation runbook

Key rotation is a separate maintenance operation. Ordinary GET/read requests must remain read-only and must never invoke rotation.

1. Take and verify the required independent encrypted pre-migration backup.
2. Generate a new 32-byte PII key, add it as `PII_ENCRYPTION_KEY_Vn`, retain the old version, and set `PII_ENCRYPTION_ACTIVE_VERSION` to the new version so new writes immediately use it.
3. Use a narrowly privileged maintenance credential in `MAINTENANCE_DATABASE_URL`. Set `ROTATE_FROM_VERSION`, `ROTATE_TO_VERSION`, `ROTATE_BATCH_SIZE` (1–500), and an approved local `ROTATION_CHECKPOINT_PATH` outside synchronized/public storage.
4. Run `pnpm maintenance:rotate-pii` repeatedly. Each invocation processes one bounded transactional batch and atomically saves a resumable stage/UUID checkpoint. It covers respondent name/phone envelopes, CURRENT and ARCHIVED answer payloads, and ResultsSnapshot free-text envelopes.
5. After completion, query every encrypted column and verify no row remains on the old version. Exercise authorized decryption of synthetic samples from every envelope type and rerun the normal test/verification gates.
6. Keep the old key through verification and the retention period of every backup that needs it. Two custodians retain all relevant versions. Retire a version only after a successful restore/decryption drill proves it is no longer required.

For compromise, stop affected writes if necessary, revoke exposed credentials, preserve safe audit evidence, introduce a new key version, rotate through this procedure, and assess archive exposure. Never log keys, plaintext, ciphertext payloads, or checkpoint-adjacent secrets.

Phone HMAC rotation requires the frozen secondary versioned lookup column/index backfill design and is not implemented by this PII re-encryption command. Short-lived rate-limit HMAC records expire naturally.
