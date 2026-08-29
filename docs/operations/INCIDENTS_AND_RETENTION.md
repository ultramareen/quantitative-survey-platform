# Operational incidents, audit, and retention

## Provider exhaustion

At warning thresholds, reconcile provider-authoritative readings and the conservative in-app estimate. At 95%, use the existing capacity protection and Admin controls; do not promise availability or enable paid upgrades. If Netlify or Cockroach pauses/throttles, preserve data, communicate temporary unavailability through approved channels, and wait for quota reset or explicit plan-change approval. Record timestamps, estimates, provider readings, alerts, survey transitions, and resolution without PII.

## Key or credential compromise

Revoke the affected credential, isolate the environment, preserve redacted evidence, identify exposed key versions and archive access, and follow `KEY_ROTATION.md`. If all required encryption keys are lost, ciphertext is unrecoverable; escalate immediately. Never copy a production key into preview or an incident ticket.

## Audit and log review

- Audit events retain actor ID, action, target/survey, timestamp, result, row count, and safe metadata only. They must not contain decrypted names, phones, answer bodies, tokens, cookies, credentials, encryption keys, or raw request bodies.
- Application logs are structured and allowlisted/redacted. Review production log retention before launch and quarterly; choose the shortest operationally adequate provider setting within the zero-cost constraint and record it in the company operations register.
- Before each release, run redaction tests and inspect captured logs from malformed requests, authorization failures, exports, maintenance errors, and backup/restore tools using synthetic canaries.
- Respondent retention/anonymization remains future-facing in the MVP. Do not invent automatic deletion. Tombstoned data remains outside ordinary access, and destructive actions require explicit approved policy and a verified backup.
