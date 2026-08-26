# Quantitative Survey Platform — Implementation Plan v1.0

**Status:** APPROVED  
**Architecture:** Frozen  
**PRD:** v1.0

## A. PRD/architecture conflict check

The previously identified conflict is resolved by the approved rule:

- Calculate Results is permitted for `ACTIVE`, `PENDING_CAPACITY`, and `COMPLETED`.
- `COMPLETED` remains permanently closed to respondents and answer mutations.
- Calculation does not change survey state.
- Every calculation creates a new immutable ResultsSnapshot.
- Existing snapshots are never overwritten.

This supersedes the narrower wording in PRD v1.0 Section 11. No other blocking contradictions were found. Earlier prompts are not requirements.

## B. Critical system invariants

UI controls may communicate these rules, but never serve as their sole enforcement layer.

| Invariant                                             | Primary enforcement                                                         | Supporting enforcement and tests                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| At most 15 active registered employees                | Serializable registration/re-enable transaction counting non-disabled Users | Invitation lock, bounded serialization retry, concurrent-registration tests |
| Role originates only from Admin invitation            | Invitation row lock; server copies `assigned_role`                          | Reject client role fields; audit and authorization tests                    |
| Only Admin changes roles                              | Server authorization policy                                                 | Atomic User/invitation update, session revocation, negative API tests       |
| Product Manager never receives respondent PII         | PII service policy returns `403` before query/decryption                    | Separate aggregate/PII DTOs, response-schema tests, E2E negative tests      |
| Researcher/Admin only for respondent PII              | Central `requirePiiRole` policy                                             | Route tests for list, detail, search, drill-down, and exports               |
| Questionnaire is immutable after activation           | Survey mutation service checks `DRAFT`                                      | Frozen-instrument database/service invariants and mutation tests            |
| Survey has 1–50 questions at activation               | Activation transaction and validation                                       | `smallint` checks, question-count verification, boundary tests              |
| Choice question has 2–11 options at activation        | Activation transaction                                                      | Position/check constraints and boundary tests                               |
| Exactly one CURRENT attempt per Respondent            | Partial unique DB index on `respondent_id WHERE status=CURRENT`             | Replacement transaction and concurrency tests                               |
| Valid same-device token restores CURRENT              | Token-resolution service runs before phone replacement                      | Lifecycle integration and E2E tests                                         |
| New-device same-phone attempt replaces CURRENT        | Atomic lock/archive/token-revoke/create transaction                         | Unique partial index and concurrent-identification tests                    |
| ARCHIVED attempts never enter current analytics       | Snapshot/raw queries require `status=CURRENT`                               | Query-contract and snapshot tests with archive-heavy fixtures               |
| Edit window is based on last successful answer change | Server-derived `editable_until`                                             | Server clock, mutation transaction timestamp, boundary tests                |
| Locked/COMPLETED attempts reject writes               | Autosave service lifecycle policy                                           | Direct API tests; UI is secondary                                           |
| PENDING blocks new respondents, not valid attempts    | Public identification and autosave policies                                 | No-name/phone PENDING route, lifecycle matrix tests                         |
| PENDING opens still count as Opened                   | PublicSurveySession creation/reuse                                          | Snapshot-cutoff and funnel tests                                            |
| Stale autosave cannot overwrite newer data            | Conditional revision plus mutation idempotency                              | One-in-flight client behavior and concurrency tests                         |
| Results use one logical cutoff                        | Exact Cockroach `AS OF SYSTEM TIME` on every source query                   | Concurrent-autosave snapshot tests                                          |
| ResultsSnapshot is immutable and aggregate-only       | Insert-only snapshot service/runtime permissions                            | Response-schema, DB inspection, and update/delete denial tests              |
| Results may be calculated in A/P/C states only        | Calculation-state policy                                                    | State matrix tests; calculation never invokes transition service            |
| Encryption keys never reach browser                   | Server-only environment configuration                                       | Build-output/client-bundle scans and preview isolation tests                |
| Plaintext PII never enters logs                       | Structured allowlisted logging                                              | Log-capture tests covering errors and malformed requests                    |
| PII XLSX is Researcher/Admin-only                     | Export service policy before query/decryption                               | Direct API negative tests and audit assertions                              |
| No silent paid infrastructure                         | Account configuration and `$0` launch gate                                  | Netlify/Cockroach console verification and operational checklist            |
| Tombstoned data is absent from ordinary access        | Default query policy and public-write rejection                             | Admin-only recovery path and tombstone integration tests                    |

## C. Dependency map

```text
Phase 0  Foundation
   ↓
Phase 1  Schema and migrations
   ↓
Phase 2  Cryptography/security primitives
   ↓
Phase 3  Authentication and authorization
   ├───────────────┐
   ↓               ↓
Phase 4          Phase 5
Employees        Survey builder/state machine
                   ↓
                 Phase 6  Public sessions and identity
                   ↓
                 Phase 7  Autosave
                   ↓
                 Phase 8  Resume/lock/replacement/PENDING behavior
                   ├──────────────┐
                   ↓              ↓
                 Phase 9        Phase 10
                 Results        Researcher PII UI
                   └──────┬───────┘
                          ↓
                        Phase 11  XLSX
                          ↓
                        Phase 12  Infrastructure protection
                          ↓
                        Phase 13  Recovery/operational hardening
                          ↓
                        Phase 14  Production readiness
```

Phase 12 can begin its estimation model after Phase 5, but automatic protection should not be approved until the complete respondent lifecycle from Phases 6–8 exists.

## D. Implementation phases

### Phase 0 — Repository and engineering foundation

**Complexity:** M

**Objective:** Establish the approved Next.js/React/TypeScript/Tailwind modular monolith and its quality boundaries.

**Dependencies:** None.

**Database changes:** None.

**Backend work:**

- Define modules for auth, employees, surveys, respondents, attempts, results, exports, infrastructure, audit, and cryptography.
- Establish typed configuration validation, error categories, request validation, transaction helpers, and redacted structured logging.
- Configure Prisma for CockroachDB without creating migrations yet.
- Define server-only versus client-safe module boundaries.

**Frontend work:**

- Establish responsive internal/public shells.
- Add shared form, error, loading, accessibility, and status primitives.
- Define routing boundaries for public, authenticated, and Admin surfaces.

**Security requirements:**

- Secure defaults for cookies, headers, CSRF strategy, CSP, redacted errors, and environment separation.
- Prevent server-only modules from entering client bundles.
- No production secrets or real PII.

**Tests:**

- Type checking, linting, formatting, module-boundary tests.
- Configuration fail-closed tests.
- Server-only import/client-bundle tests.
- Basic responsive and accessibility smoke tests.

**Acceptance criteria:**

- Clean build and test execution.
- Missing or malformed required configuration fails startup safely.
- Public/client bundles contain no server secrets or database modules.

**Demo scenario:** Start the local application with synthetic configuration, open public/internal shells, then demonstrate safe startup failure when a required test secret is removed.

**Approval gate:** Foundation structure and security boundaries.

---

### Phase 1 — Database schema and migration framework

**Complexity:** L

**Objective:** Implement the frozen relational schema, constraints, indexes, and migration discipline.

**Dependencies:** Phase 0.

**Database changes:** All schema foundations described in Section E, applied through small ordered migrations.

**Backend work:**

- Configure Prisma models and Cockroach-compatible migrations.
- Add transaction retry helper for serialization failures.
- Define runtime, migration, and maintenance database privilege expectations.
- Create schema integrity tests and synthetic seed interfaces.

**Frontend work:** None beyond a development-only schema health indicator if useful.

**Security requirements:**

- Foreign keys default to restrictive deletion.
- No plaintext respondent fields.
- Runtime role must not alter schema or mutate snapshots.
- Migration output must be reviewed before execution.

**Tests:**

- Migrate an empty database from zero to the latest schema.
- Repeat fresh migrations and verify deterministic results.
- Verify every enum, FK, check, unique, partial unique, and index.
- Confirm invalid cross-survey references and duplicate CURRENT attempts fail.
- Upgrade-migration testing becomes mandatory only after a deployed schema version exists.

**Acceptance criteria:**

- A clean database reaches the expected latest schema deterministically.
- Repeated fresh migration runs produce the same schema.
- Prisma schema and generated SQL preserve all frozen constraints and indexes.
- Destructive cascades cannot remove respondent/history data.

**Demo scenario:** Run migrations against an empty local Cockroach database, inspect constraints, and demonstrate rejection of two CURRENT attempts for one Respondent.

**Approval gate:** Included with Phases 0–2.

---

### Phase 2 — Cryptography and security primitives

**Complexity:** L

**Objective:** Implement and verify all cryptographic envelopes and secret handling before any real PII feature.

**Dependencies:** Phases 0–1.

**Database changes:** None beyond the encrypted/versioned columns already created.

**Backend work:**

- AES-256-GCM envelope with purpose, record ID, key version, random 96-bit nonce, authenticated tag, and AAD.
- Versioned key registry with one active write version and retained read versions.
- Survey-scoped phone HMAC.
- Independent rate-limit HMAC.
- SHA-256 hashing for attempt, session, and reset tokens.
- Argon2id password hashing with frozen minimum parameters.
- Cryptographically secure token/reference-ID generation.
- Startup secret validation and maintenance-only re-encryption interface contract.

**Frontend work:** None; cryptographic APIs remain server-only.

**Security requirements:**

- No lazy re-encryption on GET.
- No key reuse between encryption, phone lookup, rate limits, or backups.
- Nonces must never be reused with the same key.
- Plaintext and keys excluded from errors/logs.
- Cryptographic modules must be server-only and impossible to import into or expose through client-side bundles.

**Tests:**

- Round-trip and property tests.
- Wrong key/version/AAD tests.
- Modified ciphertext, nonce, and authentication-tag tests.
- Malformed/truncated envelope tests.
- Phone HMAC stability and survey isolation.
- Token hash valid/invalid and timing-safe comparison.
- Password correct/incorrect and parameter inspection.
- Server-only module-boundary and client-bundle exposure tests.
- Real `PRODUCT_MANAGER` → `403`-before-decryption tests begin after authentication/authorization exists in Phases 3 and 10.

**Acceptance criteria:**

- All tampering fails closed without plaintext/log leakage.
- Identical plaintext produces different ciphertext.
- Same phone produces the same HMAC only within the same survey/key version.
- Cryptographic functionality and key material cannot be imported into, bundled with, or exposed to browser code.

**Demo scenario:** Encrypt/decrypt synthetic data, then alter one ciphertext byte and demonstrate authenticated failure with a redacted log; inspect the client bundle to confirm the cryptographic module and keys are absent.

**Approval gate 1:** Stop after foundation, reviewed migrations, cryptographic tests, and security primitives.

---

### Phase 3 — Employee authentication and role authorization

**Complexity:** L

**Objective:** Provide Better Auth-based employee sessions, password login/reset, and central three-role authorization.

**Dependencies:** Phases 0–2.

**Database changes:** Auth account, credential, session, and password-reset records from Phase 1 become active.

**Backend work:**

- Better Auth integration using self-hosted tables.
- Argon2id credentials, hashed sessions/reset tokens, session expiry and revocation.
- Central policies for authentication, role, ownership, tombstone access, and PII capability.
- Authorization-version/session invalidation checks.
- One-time non-public initial Admin bootstrap procedure.

**Frontend work:**

- Login, registration shell, forgot/reset password, logout, expired-session handling.
- Role-aware navigation without treating navigation as authorization.

**Security requirements:**

- Host-only Secure HttpOnly SameSite cookies in production.
- CSRF and Origin/Host checks for mutations.
- Generic login/reset responses.
- Reset success revokes old sessions and tokens.
- No public initial-Admin registration route.

**Tests:**

- Login/logout/session expiry/reset unit and integration tests.
- Session fixation and token replay tests.
- Disabled-user and authorization-version invalidation.
- Role matrix skeleton with direct API negative calls.
- CSRF and malformed-origin tests.

**Acceptance criteria:**

- Only a bootstrapped Admin can initially authenticate.
- Expired, disabled, or revoked sessions cannot access internal APIs.
- Role checks are reusable and server-enforced.

**Demo scenario:** Sign in as bootstrap Admin, reset the password using a synthetic email transport, and show that the prior session no longer works.

---

### Phase 4 — Admin employee invitation and role management

**Complexity:** M

**Objective:** Deliver exact-email invitation, registration, role assignment/change, disable/re-enable, and the 15-active-user invariant.

**Dependencies:** Phase 3.

**Database changes:** Activate EmployeeInvitation relations, status checks, assigned role, audit entries, and supporting indexes.

**Backend work:**

- Admin add/remove-unused-invitation operations.
- Registration transaction: lock invitation, validate exact normalized email/status, count active Users `<15`, copy assigned role, link User, mark REGISTERED.
- Admin role-change transaction updating User/invitation, incrementing authorization version, auditing, and revoking sessions.
- Disable/re-enable with the same active-count protection.

**Frontend work:**

- Admin employee list.
- Invitation form with exact email and role selector.
- Role change, disable/re-enable, and unused-invitation removal.
- Employee registration form without role input.

**Security requirements:**

- Admin-only management routes.
- Registration ignores/rejects any role field.
- Email normalization is deterministic.
- Generic responses must not expose allowlist membership unnecessarily.

**Tests:**

- Unit tests for normalization/status transitions.
- Direct non-Admin API denial.
- Concurrent registrations/re-enables at 14 active users.
- Duplicate email and reused invitation tests.
- Role change revokes old sessions and writes audit event.

**Acceptance criteria:**

- Sixteen simultaneous eligible registrations can never create more than 15 active Users.
- User role always equals the Admin-assigned invitation role at registration.
- Disabled users lose access immediately and stop counting toward 15.

**Demo scenario:** Invite a Product Manager, register through the exact email, verify the assigned role, change it to Researcher, and show the prior session is invalidated.

**Approval gate 2:** Employee authentication, invitation, role management, and negative authorization behavior.

---

### Phase 5 — Survey management, builder, and state machine

**Complexity:** L

**Objective:** Deliver survey creation, questionnaire authoring, duplication, lifecycle transitions, and tombstones.

**Dependencies:** Phases 1, 3, and 4.

**Database changes:** Survey, Question, AnswerOption, tombstone fields, state/version fields, and audit relations.

**Backend work:**

- Create/list/view surveys.
- Owner-only Draft editing.
- Activation validation for 1–50 questions and 2–11 options per choice question.
- Transactional instrument freeze.
- Explicit transitions among DRAFT, ACTIVE, PENDING_CAPACITY, and COMPLETED.
- Permanent COMPLETED behavior.
- Duplication into instrument-only DRAFT.
- Admin hard delete only for empty data-free DRAFT; otherwise tombstone.
- State-version concurrency control and transition auditing.

**Frontend work:**

- Create Survey, Active/Operational, and History pages.
- Builder for title, description, question type, required/optional, ordering, and options.
- Separate Pause and Complete actions.
- Duplicate, public URL, status badges, tombstone/Admin controls.
- Activation validation summary.

**Security requirements:**

- Ownership and Admin lifecycle policies applied server-side.
- Public IDs are high entropy.
- Respondent-controlled HTML is never rendered.
- Ordinary queries exclude tombstones.

**Tests:**

- Builder unit tests and 0/1/50/51-question boundaries.
- Choice options 1/2/11/12 boundaries.
- Instrument mutation after activation rejected through direct API.
- Every allowed/forbidden state transition.
- Concurrent activation/state-version tests.
- Hard-delete versus tombstone and restrictive-FK tests.

**Acceptance criteria:**

- Valid DRAFT activates and becomes immutable.
- Pause is reversible; Complete is permanent.
- Tombstoned surveys disappear from ordinary access without data loss.

**Demo scenario:** Build a survey containing all three question types, fail activation with 12 options, correct it, activate it, prove editing is rejected, then duplicate it into a new DRAFT.

**Approval gate 3:** Survey builder, immutable instrument, lifecycle, and deletion behavior.

---

### Phase 6 — PublicSurveySession and Respondent identity

**Complexity:** L

**Objective:** Implement public opens, PII-free sessions, ACTIVE identification, phone normalization, and Respondent creation.

**Dependencies:** Phases 2 and 5.

**Database changes:** PublicSurveySession, Respondent, reference-ID and phone-HMAC indexes, plus the deferred nullable session-to-respondent FK.

**Backend work:**

- Resolve/create hashed open token.
- Reuse the same PublicSurveySession for a valid cookie.
- Count separate browser/device tokens as separate Opens.
- ACTIVE identification with country-contextual E.164 normalization.
- Encrypt name/phone, calculate survey-scoped HMAC, and create collision-safe reference ID.
- Uniform public responses that do not disclose phone existence.
- PENDING route creates/reuses only PublicSurveySession and never accepts identity.

**Frontend work:**

- Mobile-first public survey entry.
- Country selector and phone field.
- PENDING temporary-unavailable page.
- Invalid/ambiguous phone errors without country guessing.

**Security requirements:**

- No PII in URLs, logs, or PublicSurveySession.
- Token cookie is Secure/HttpOnly/SameSite.
- Uniform duplicate/new-phone response behavior.
- Public request/rate/body limits.

**Tests:**

- Open creation/reuse and cookie-reset behavior.
- Two opens later linking to one Respondent.
- E.164 normalization and ambiguous-number rejection.
- Reference-ID collision retry.
- PENDING creates Open only.
- Database inspection verifies only encrypted name/phone.

**Acceptance criteria:**

- Anonymous visitors count as Opens without becoming Respondents.
- ACTIVE identification creates encrypted identity and one blank CURRENT attempt.
- PENDING never accepts name/phone or creates Respondent/Attempt.

**Demo scenario:** Open twice in one browser and once in private browsing, verify two Opens, then identify only the original browser and inspect that no plaintext name/phone exists in the database.

---

### Phase 7 — ResponseAttempt payload and autosave

**Complexity:** XL

**Objective:** Implement canonical encrypted answers, optimistic revisions, idempotent mutations, and minimal IndexedDB retry.

**Dependencies:** Phases 2 and 6.

**Database changes:** ResponseAttempt fields and the partial CURRENT unique index become fully exercised.

**Backend work:**

- Sparse canonical answer-payload codec.
- Per-question mutation validation against frozen instrument.
- Revision, generation, and mutation-ID handling.
- Atomic decrypt/validate/change/re-encrypt/count/revision transaction.
- Server timestamps for `last_answer_changed_at`.
- Bounded Cockroach serialization retry.
- Reject stale generation, archived token, locked attempt, completed/tombstoned survey.

**Frontend work:**

- Immediate single-choice saving.
- Short-debounce multiple choice.
- 500–1,000 ms free-text debounce plus blur/Submit flush.
- One in-flight mutation discipline and Saving/Saved/Retry states.
- IndexedDB latest-unacknowledged mutation per question.
- Ack, invalid-token, lifecycle, and 24-hour purge.

**Security requirements:**

- IndexedDB contains no phone, name, token, keys, full payload, or acknowledged history.
- Local free text is treated as temporary plaintext risk.
- CSP/XSS controls and no cross-device synchronization.

**Tests:**

- Payload codec and validation unit tests.
- Idempotent replay.
- Stale base revision/generation.
- Concurrent mutations and Cockroach retries.
- Answer deletion resets the edit timer; no-op replay does not.
- IndexedDB acknowledgement/retry/purge.
- Malformed/oversized answer rejection.
- Store synthetic single-choice, multiple-choice, and free-text answers; inspect the database directly and verify none of their answer contents appear in plaintext.

**Acceptance criteria:**

- Network retries cannot duplicate logical changes.
- Older mutations cannot overwrite newer state.
- Server database remains canonical after disconnect/reconnect.
- Direct database inspection after synthetic saves reveals no plaintext single-choice, multiple-choice, or free-text answer contents.

**Demo scenario:** Answer a free-text question, interrupt connectivity before acknowledgement, reopen on the same browser, reconnect, and show one successful canonical save with the local entry removed; inspect the database to confirm the answer content is ciphertext only.

---

### Phase 8 — Resume, locking, replacement, and PENDING attempt behavior

**Complexity:** L

**Objective:** Complete the respondent lifecycle across device identity, 24-hour expiry, replacement, PENDING, and COMPLETED.

**Dependencies:** Phase 7.

**Database changes:** No new tables; exercise token revocation, archive fields, attempt generation, and indexes.

**Backend work:**

- Resolve valid CURRENT token before phone-duplicate logic.
- Derive `editable_until` from last successful change or attempt creation.
- Lock empty attempts after 24 hours without a saved answer.
- Silent new-device replacement transaction while ACTIVE.
- PENDING permits only valid editable CURRENT tokens.
- COMPLETED rejects every answer mutation and new/replacement attempt.
- Submit flushes, validates required questions, and confirms without changing analytical completion semantics.

**Frontend work:**

- Restore saved answers on valid same-device reopen.
- Recorded message after lock.
- Uniform new-device identification flow without duplicate confirmation.
- Submit required-question feedback.
- Closed/temporary-unavailable states.

**Security requirements:**

- Old token is nulled/revoked atomically during replacement.
- No duplicate-existence, prior coverage, or prior answer disclosure.
- Lifecycle decisions use server time and server state.

**Tests:**

- Full lifecycle matrix in Section G.
- Exact 24-hour boundary.
- Same token versus missing/invalid token.
- Two concurrent new-device replacements.
- Transition to PENDING during an in-flight autosave.
- Transition to COMPLETED during an in-flight autosave.

**Acceptance criteria:**

- Same-device restoration never archives its own CURRENT attempt.
- New-device identification leaves exactly one blank CURRENT attempt and one preserved ARCHIVED predecessor.
- Existing editable attempts continue during PENDING; no new identity starts.

**Demo scenario:** Complete half a survey in browser A, resume it in A, then identify using the same phone in browser B and show a blank replacement while A’s token becomes invalid and the archived answers remain preserved.

**Approval gate 4:** Public identity, autosave, same/new-device lifecycle, locking, and PENDING behavior.

---

### Phase 9 — ResultsSnapshot calculation

**Complexity:** XL

**Objective:** Calculate immutable aggregate snapshots at a single logical cutoff for ACTIVE, PENDING_CAPACITY, and COMPLETED surveys.

**Dependencies:** Phase 8.

**Database changes:** ResultsSnapshot persistence and insert-only runtime permissions.

**Backend work:**

1. Authorize survey owner or Admin and validate A/P/C state.
2. Select one safe Cockroach historical cutoff.
3. Read PublicSurveySession, Respondent, and CURRENT attempts with keyset pagination using the exact same `AS OF SYSTEM TIME`.
4. Batch-decrypt CURRENT answer payloads.
5. Calculate Opened, Identified, Started, >50%, and Completed.
6. Calculate single-choice, multiple-choice, and normalized free-text groups.
7. Derive positive tied leaders; produce no leader for all-zero results.
8. Recheck non-tombstoned/eligible state.
9. Insert new immutable snapshot and audit.
10. Return an aggregate-only DTO.
11. Never invoke a survey transition; COMPLETED stays COMPLETED.

**Frontend work:**

- Calculate Results button for owner/Admin.
- Latest snapshot and calculation timestamp.
- Snapshot history list.
- Operational counters clearly separated from calculated results.
- Table-based MVP results; no charts.
- No respondent drill-down for Product Managers.

**Security requirements:**

- No respondent ID, reference ID, name, phone, or respondent-answer link in snapshot/API.
- Answer-derived free-text labels use the approved encrypted snapshot envelope.
- Plaintext exists only during authorized server computation and is not logged.
- Double-click protection does not replace snapshots; distinct accepted calculations remain immutable.

**Tests:**

- Snapshot during concurrent autosaves proves one cutoff.
- Archived-heavy fixture proves exclusion.
- PENDING opens included in Opened.
- Locked/editable CURRENT attempts counted equally.
- Denominator-zero behavior.
- Single/multiple/free-text calculations.
- ≤10 versus >10 free-text groups.
- Positive ties and all-zero behavior.
- Repeated calculations create distinct snapshots.
- A/P/C accepted; DRAFT/tombstoned rejected.
- Product Manager owner receives aggregate-only response.
- Load tests at 1,000 respondents × 20 questions and guarded 5,000-row batches.

**Acceptance criteria:**

- Re-running creates a new snapshot without modifying the old one.
- Every metric corresponds to the persisted cutoff.
- Calculate Results on COMPLETED succeeds without changing its state or enabling writes.

**Demo scenario:** Calculate while ACTIVE, add responses, complete the survey, calculate again, and compare two immutable snapshots while proving the public survey remains closed.

**Approval gate 5:** Results correctness, consistency, immutability, and COMPLETED behavior.

---

### Phase 10 — Researcher/Admin respondent interface

**Complexity:** L

**Objective:** Provide authorized respondent search and PII views without exposing them to Product Managers.

**Dependencies:** Phases 4 and 8.

**Database changes:** No new schema; use reference-ID and survey indexes.

**Backend work:**

- Researcher/Admin respondent list/detail/search.
- Exact normalized reference-ID lookup across surveys.
- Batch server-side name/phone decryption after authorization.
- Current coverage and derived editable/locked state.
- Separate aggregate and PII DTOs.

**Frontend work:**

- Respondent table with reference ID, name, phone, survey, coverage, timestamps, and state.
- Reference-ID search and optional survey filters.
- No encryption internals.
- Product Manager receives no route/navigation and direct API returns `403`.

**Security requirements:**

- PII role check before querying/decrypting.
- Private/no-store responses.
- No PII in URL query values except non-secret reference ID; names/phones are not URL filters.
- Sensitive access auditing at approved granularity.

**Tests:**

- Full role matrix for list/detail/search.
- Product Manager direct API calls return `403` before PII is queried/decrypted and expose no PII in body/logs.
- Disabled/stale-role sessions.
- Reference ID is not accepted by public routes.
- Cross-survey Researcher access succeeds intentionally.

**Acceptance criteria:**

- Researcher/Admin can locate a respondent by reference ID and see decrypted contact data.
- Product Manager cannot retrieve the same data through UI, API, errors, or logs.

**Demo scenario:** Search `R-…` as Researcher and see name/phone; repeat the exact API call as Product Manager and receive `403`.

---

### Phase 11 — XLSX exports

**Complexity:** L

**Objective:** Deliver aggregate and role-restricted respondent exports using ExcelJS without permanent storage.

**Dependencies:** Phases 9–10.

**Database changes:** Audit records only.

**Backend work:**

- Aggregate ResultsSnapshot export for all roles.
- Current Raw, Archived Attempts, and respondent-level Free Text exports for Researcher/Admin.
- Streaming generation with deterministic partitions when predicted size/time exceeds synchronous guard.
- Timestamped current-state exports distinct from snapshots.
- Formula-injection neutralization.

**Frontend work:**

- Role-appropriate export actions.
- Separate Current/Archived/Free Text choices.
- Partition guidance for large exports.
- Clear export timestamp/source labels.

**Security requirements:**

- PII authorization before query/decryption.
- Private/no-store/nosniff attachment response.
- No permanent URLs or object storage.
- Every respondent-level export audited.
- Respondent values written as text; dangerous prefixes neutralized.

**Tests:**

- Role matrix and direct Product Manager denials.
- Formula prefixes `=`, `+`, `-`, `@`, tab, CR, and LF.
- Unicode, long free text, multiple selections, blank cells.
- Archived/current separation.
- Connection abort and plaintext cleanup.
- Size/time partition behavior.

**Acceptance criteria:**

- Product Manager can export aggregates only.
- Researcher/Admin can export all approved respondent datasets.
- Generated workbooks do not execute respondent-supplied formulas.

**Demo scenario:** Export a fixture containing `=HYPERLINK(...)` and verify Excel treats it as text; show Product Manager denial for the same raw export.

**Approval gate 6:** PII interface, negative authorization, auditing, and XLSX safety.

---

### Phase 12 — Infrastructure usage and capacity protection

**Complexity:** XL

**Objective:** Implement estimated free-tier visibility, manual reconciliation, alerts, and automatic survey protection.

**Dependencies:** Phases 5 and 8; email capability from Phase 3.

**Database changes:** InfrastructureUsageSnapshot, InfrastructureEstimateBucket, InfrastructureDeployment, InfrastructureAlertDelivery, InfrastructureControlState, and related AuditEvent records.

**Backend work:**

- Conservative Netlify credit estimator from sampled requests, duration, bytes, static multiplier, and idempotent production deploy IDs.
- Cockroach RU/storage estimation and Admin manual actual reconciliation.
- Exact application Resend counters.
- Cached highest-risk headline reading.
- Three-hour Netlify Scheduled Function.
- Per-provider/quota/period threshold latches for 50/75/90/95/99.
- Atomic ≥95% all-ACTIVE-to-PENDING transition when two or more are ACTIVE.
- At-most-one-ACTIVE enforcement above 95%.
- Owner reactivation only when permitted; Admin atomic cross-owner switch.
- Admin Pause All.
- 99% critical state without automatic completion/archive.

**Frontend work:**

- All-role Estimated Infrastructure Usage bar.
- Staleness/source label.
- Admin quota detail, provider links, manual reconciliation.
- Pause All and atomic switch UI.
- Threshold and critical-state messaging.

**Security requirements:**

- Manual reconciliation and infrastructure controls are Admin-only.
- Never present estimates as provider-actual.
- No provider-dashboard scraping or undocumented endpoints.
- Alert details contain no respondent PII.
- `$0` controls remain external release gates.

**Tests:**

- Estimator formula and calibration fixtures.
- Source precedence: estimate versus dated manual actual.
- Threshold crossing/deduplication/new-period tests.
- Failed Resend alert retry.
- Concurrent activation at ≥95%.
- 0/1/2+ ACTIVE transition cases.
- Pause All/switch authorization and audit.
- 99% selected ACTIVE remains ACTIVE.
- Scheduled-check cost/load verification.

**Acceptance criteria:**

- Employees see a clearly labeled, cached risk percentage.
- Every threshold sends once per provider/quota period.
- At ≥95% estimated infrastructure usage, if exactly one survey is ACTIVE, it remains ACTIVE and is not automatically paused.
- At ≥95%, concurrency cannot leave more than one ACTIVE after protection/selection.
- No behavior promises availability after provider exhaustion.

**Demo scenario:** First set synthetic estimated usage to 95% with exactly one ACTIVE survey and show it remains ACTIVE. Then use three ACTIVE surveys, run the check, observe all three become PENDING, and use Admin switch controls to select exactly one ACTIVE survey.

**Approval gate 7:** Usage labeling, alerts, concurrency-safe capacity transitions, and Admin controls.

---

### Phase 13 — Backup, restore, and operational hardening

**Complexity:** L

**Objective:** Establish verifiable zero-cost recovery, key rotation, migration safety, and operational procedures.

**Dependencies:** Phases 1–12.

**Database changes:** Only migration/maintenance checkpoints if already defined; no product redesign.

**Backend work:**

- Document and test managed Cockroach backup visibility/restore constraints.
- Independent logical backup procedure before risky migrations and monthly.
- Authenticated whole-archive encryption using separately held backup key.
- Resumable maintenance-only re-encryption workflow.
- Audit/log retention and redaction review.
- Operational runbooks for provider exhaustion, key compromise, and restore.

**Frontend work:** Minimal Admin status links only if already in scope; recovery operations remain controlled-machine procedures.

**Security requirements:**

- Backup key separate from archive and runtime.
- Approved company-controlled encrypted storage only.
- Two custodians retain recovery material and relevant key versions.
- Restored environment is isolated and destroyed after the drill.

**Tests:**

- Full logical backup and restore.
- Application starts against restored database.
- Authorized sample decryption.
- Survey/current/archive/snapshot integrity.
- Old/new encryption-key version migration.
- Logs and backup contents inspected for prohibited plaintext.

**Acceptance criteria:**

- Actual restore drill succeeds before production.
- Documented RPO/RTO and custodians exist.
- Key rotation never mutates ordinary GET requests.

**Demo scenario:** Restore synthetic data into an empty nonproduction database, start the application, decrypt one authorized respondent, verify snapshots, then destroy the environment.

---

### Phase 14 — Production readiness and deployment

**Complexity:** L

**Objective:** Verify the complete product against frozen acceptance requirements and deploy safely within `$0`.

**Dependencies:** All preceding phases and approvals.

**Database changes:** Apply only reviewed production migrations.

**Backend work:**

- Production configuration validation.
- Health/smoke endpoints without sensitive details.
- Final rate/body limits and security headers.
- Scheduled function and Resend delivery verification.

**Frontend work:**

- Final responsive/accessibility review.
- Complete role and public lifecycle smoke flows.
- Production-safe error and unavailable states.

**Security requirements:**

- Production/preview credentials and encryption keys are unrelated.
- Netlify paid upgrades/recharge disabled.
- Cockroach has no payment method or visibly enforced `$0` limit.
- No production PII in preview/test.
- Native provider alerts enabled.

**Tests:**

- Full release suite.
- Migration rehearsal.
- Production smoke tests with synthetic records.
- Authorization, encryption, lifecycle, autosave, PENDING, XLSX, backup, and load gates.
- Verify production build contains no secrets/source maps exposing internals.

**Acceptance criteria:**

- Every PRD acceptance item passes.
- Restore and capacity/load gates pass.
- First production survey is created only after final approval.

**Demo scenario:** Run an end-to-end synthetic survey as each employee role and respondent lifecycle, calculate results after completion, exercise capacity pause, export as Researcher, and verify Product Manager PII denial.

**Approval gate 8:** Production launch authorization.

## E. Database migration sequence

No migrations are created during planning. Intended order:

1. **Core enums and User/authentication**
   - Enums: employee roles and invitation statuses.
   - User PK, normalized unique email, role, authorization version, disabled timestamps.
   - Password credentials, sessions, reset tokens, hashes, expiry indexes.
   - Initial Admin bootstrap support.

2. **EmployeeInvitation**
   - Unique normalized email.
   - `assigned_role`, status, nullable unique User FK, inviter/disable metadata.
   - Status/user/timestamp checks.
   - Restrictive deletion rules.

3. **Survey and audit foundation**
   - Survey UUID PK, random public ID, owner FK, status, pause reason, state version.
   - Question count, lifecycle timestamps, tombstone fields.
   - AuditEvent with safe actor/action/target metadata.
   - Active/owner/tombstone indexes.

4. **Question and AnswerOption**
   - Question composite survey keys and unique survey position.
   - `smallint` positions/counts.
   - Option unique question position and cross-survey protection.
   - Application activation validates 1–50 questions and 2–11 choice options.

5. **PublicSurveySession and Respondent**
   - Create PublicSurveySession initially with nullable respondent reference.
   - Create Respondent with encrypted name/phone, nonces/key versions, survey-scoped HMAC, random unique reference ID.
   - Add the nullable session-to-respondent FK after both tables exist.
   - Unique `(survey_id, phone_lookup_hash)` partial index and reference-ID index.

6. **ResponseAttempt**
   - Respondent/survey/session FKs.
   - CURRENT/ARCHIVED status, generation, attempt number, hashed browser token.
   - Encrypted payload, nonce/key version/schema version.
   - Revision, mutation ID, counts, timestamps, archive reason.
   - Unique attempt number and partial one-CURRENT-per-Respondent index.

7. **ResultsSnapshot**
   - Survey/creator FKs, cutoff timestamps, funnel counts.
   - Aggregate JSONB and encrypted free-text aggregate envelope.
   - Schema version and latest-snapshot index.
   - Runtime role denied update/delete.

8. **Infrastructure records**
   - Usage snapshots.
   - Estimate buckets.
   - Observed production deployment IDs.
   - Alert-delivery threshold latches.
   - Singleton control state.
   - RateLimitBucket with expiry indexes.

9. **Constraint/index hardening migration**
   - Verify partial indexes and composite FKs generated correctly for Cockroach.
   - Add any constraints Prisma cannot express through reviewed SQL.
   - Validate existing synthetic rows before constraints become mandatory.

For the greenfield initial implementation, every migration is tested from an empty database and repeated to verify deterministic fresh-schema results. Upgrade-migration testing becomes mandatory once a deployed schema version exists. Risky production migrations require an independent encrypted backup first.

## F. Security implementation sequence

1. Fail-closed environment validation and server/client module separation.
2. Cryptographic randomness and token/reference-ID generation.
3. AES-GCM versioned envelope and tamper tests.
4. Phone and rate-limit HMAC separation.
5. Argon2id passwords and hashed session/reset/attempt tokens.
6. Better Auth session lifecycle and CSRF controls.
7. Central role/ownership/PII policies.
8. Redacted structured logging and safe error mapping.
9. Public rate/body limits and high-entropy identifiers.
10. Encrypted respondent persistence and tokenized lifecycle.
11. Aggregate-only calculation DTOs.
12. Researcher/Admin-only PII routes.
13. Streaming XLSX authorization and formula safety.
14. Maintenance-only key rotation.
15. Independent encrypted backup and restore/decryption drill.

Security work stops if any negative authorization or tamper test fails.

## G. Test strategy

### Testing pyramid

- **Unit:** validation, crypto, normalization, formulas, state predicates, estimators, spreadsheet neutralization.
- **Service/integration:** Cockroach constraints/transactions, auth policies, autosave concurrency, lifecycle, snapshots, exports.
- **End-to-end:** employee roles, builder, respondent devices, PENDING, calculation, PII denial/access.
- **Operational:** load, quota simulation, migration rehearsal, backup restore, production smoke tests.

### Authorization matrix

| Sensitive operation                            | Product Manager | Researcher | Admin |
| ---------------------------------------------- | --------------: | ---------: | ----: |
| View surveys/questionnaires/counters/snapshots |           Allow |      Allow | Allow |
| Create/duplicate and manage own survey         |           Allow |      Allow | Allow |
| Calculate own survey                           |           Allow |      Allow | Allow |
| Calculate another owner’s survey               |            Deny |       Deny | Allow |
| Manage another owner’s lifecycle               |            Deny |       Deny | Allow |
| Respondent list/detail/reference search        |           `403` |      Allow | Allow |
| Decrypted name/phone/raw answers               |           `403` |      Allow | Allow |
| Current Raw/Archived/Free Text XLSX            |           `403` |      Allow | Allow |
| Aggregate snapshot XLSX                        |           Allow |      Allow | Allow |
| Employee/role management                       |           `403` |      `403` | Allow |
| Infrastructure reconciliation/Pause All/switch |           `403` |      `403` | Allow |
| Tombstone/delete/Admin audit views             |           `403` |      `403` | Allow |

Every denial is tested by direct API call, not only UI visibility.

### Respondent lifecycle matrix

| Scenario                             | Expected result                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| First visit                          | New Open; after ACTIVE identification, encrypted Respondent and blank CURRENT |
| Same-device return                   | Valid token restores same CURRENT and DB answers                              |
| Same device within 24 hours          | Changes accepted; successful logical change resets timer                      |
| Same device after 24 hours           | Recorded message; mutation rejected; no automatic replacement                 |
| New device + same phone while ACTIVE | Previous CURRENT becomes ARCHIVED/token revoked; blank new CURRENT            |
| PENDING + new visitor                | Opened increases; no identity fields, Respondent, or Attempt                  |
| PENDING + valid existing attempt     | Restore/autosave within edit window                                           |
| COMPLETED                            | Public/attempt writes rejected; Calculate Results remains allowed             |
| Concurrent autosave                  | Older revision cannot overwrite newer payload                                 |
| Concurrent replacement               | Exactly one CURRENT remains                                                   |

### Results test set

- Exact single cutoff during concurrent writes.
- All funnel definitions and zero denominator.
- PENDING Opens remain in denominator.
- Optional questions included in coverage.
- Single/multiple/free-text rules.
- ≤10/all and >10/Top 10 behavior.
- Positive ties and all-zero leader behavior.
- CURRENT only; ARCHIVED excluded.
- Repeated immutable snapshots.
- ACTIVE/PENDING/COMPLETED calculation.
- Aggregate-only Product Manager response.
- 1,000 × 20 normal load and larger guarded cases.

### Execution gates

**Every pull request:**

- Lint, formatting, type check.
- Unit tests.
- Schema validation.
- Crypto/security regression tests.
- Authorization negative tests for affected routes.
- Focused integration tests.

**Before a database migration:**

- Generated SQL review.
- Empty-to-latest and deterministic fresh-migration tests for the greenfield initial schema.
- Once a deployed schema version exists, upgrade testing from every supported predecessor becomes mandatory.
- Constraint/index verification.
- Production-like synthetic data rehearsal.
- Backup requirement decision.

**Before deployment:**

- Full integration and E2E suite.
- Migration rehearsal.
- Secret/bundle/log scan.
- Autosave concurrency and PENDING tests.
- XLSX injection suite.
- Preview smoke test using synthetic data.

**Before production launch:**

- All prior gates.
- Actual backup restore/decryption drill.
- Free-tier load/capacity test.
- `$0` provider configuration evidence.
- Native/provider alert verification.
- Final authorization penetration-style negative checks.

## H. Development/test-data strategy

No real respondent or employee PII is permitted.

Fixture profiles:

- **Minimal:** one Admin, Product Manager, Researcher, survey, Respondent, and attempt.
- **Lifecycle:** duplicate phone, CURRENT plus multiple ARCHIVED attempts, editable/locked/empty attempts, PENDING and COMPLETED surveys.
- **Builder limits:** zero-question DRAFT, 50-question valid survey, 51-question invalid fixture, 11-option valid and 12-option invalid choice question.
- **Results:** zero answers, positive ties, all-zero options, multiple-choice >100%, 10 and 11 normalized free-text groups.
- **Scale:** 1,000 Respondents × 20 questions with deterministic coverage/archives; optional 5,000-row performance dataset.
- **Infrastructure:** synthetic estimate/manual-actual readings around every threshold.

Data conventions:

- Employees use `example.com`.
- Names are explicit synthetic labels such as `Synthetic Researcher 0042`.
- Public phone-validation tests use documented library example numbers.
- Bulk load fixtures use isolated, clearly synthetic E.164-shaped values and are never passed to any communication provider.
- Free text uses generated neutral phrases plus formula-injection strings.
- Encryption/HMAC keys are test-only and unrelated to preview/production.
- Fixture generation is deterministic by seed except cryptographic collision/token tests.

## I. Environment strategy

### Local development

- Local single-node CockroachDB or approved isolated nonproduction Basic database.
- Synthetic fixtures only.
- Local/test secrets.
- Resend disabled or routed to a safe test adapter.
- Secure-cookie behavior configurable only for localhost.

### Automated test

- Fresh isolated database/schema per run.
- Deterministic test keys.
- Fake clock for 24-hour boundaries.
- Stubbed Resend/provider readings.
- No external production services.

### Preview

- Separate nonproduction database and credentials.
- Unrelated PII, phone-HMAC, rate-limit, and auth secrets.
- Synthetic data only.
- Resend restricted to approved test recipients/domain behavior.
- No production provider manual readings or backup keys.

### Production

Required runtime configuration includes:

- Production `DATABASE_URL`.
- Better Auth/session secret and canonical application URL.
- Versioned `PII_ENCRYPTION_KEY_Vn`.
- Versioned `PHONE_LOOKUP_HMAC_KEY_Vn`.
- `RATE_LIMIT_HMAC_KEY`.
- Resend API key, verified sender, and Admin recipients.
- Logging/redaction and infrastructure-estimator configuration.

The independent `BACKUP_ENCRYPTION_KEY` belongs on the controlled backup machine and is not exposed to preview or ordinary application runtime. Production database credentials and keys never enter preview deployments.

## J. Deployment sequence

1. Reverify Netlify Free, Cockroach Basic, and Resend Free terms.
2. Confirm Netlify paid upgrade/recharge is disabled.
3. Confirm Cockroach has no payment method or a visibly enforced `$0` limit.
4. Provision single-region production Cockroach cluster.
5. Create least-privilege runtime and migration credentials.
6. Configure production-only secrets in Netlify.
7. Verify Resend company domain and Admin recipients.
8. Take required pre-migration backup where applicable.
9. Apply reviewed migrations using migration credentials.
10. Run schema/constraint verification.
11. Deploy application to Netlify.
12. Execute controlled initial Admin bootstrap.
13. Enable/test scheduled quota check and native provider alerts.
14. Run synthetic production smoke tests.
15. Perform independent backup and full restore/decryption drill.
16. Run authorization, lifecycle, autosave, XLSX, and capacity release suites.
17. Remove synthetic production smoke data according to approved cleanup procedure.
18. Obtain final approval.
19. Create and activate the first production survey.

No deployment is authorized merely because the application builds.

## K. Approval gates

1. **Foundation/schema/security:** Phases 0–2.
2. **Employee/Admin platform:** Phases 3–4.
3. **Survey builder:** Phase 5.
4. **Respondent flow/autosave:** Phases 6–8.
5. **Results:** Phase 9.
6. **PII and XLSX:** Phases 10–11.
7. **Infrastructure protection:** Phase 12.
8. **Production readiness:** Phases 13–14.

At each gate, implementation stops. The next phase begins only after the completed increment, tests, known limitations, and demo scenario are reviewed and approved.

## L. Risk register

| Risk                                | Primary phase | Impact                             | Mitigation/gate                                             |
| ----------------------------------- | ------------- | ---------------------------------- | ----------------------------------------------------------- |
| Incorrect AES-GCM/key handling      | 2             | Irrecoverable data or PII exposure | Crypto vectors, tamper tests, key-version and restore tests |
| Authorization route bypass          | 3, 10, 11     | Product Manager PII exposure       | Central policy, separate DTOs, direct API negative tests    |
| Registration race exceeds 15        | 4             | Product invariant violation        | Serializable count/lock/retry concurrency test              |
| Instrument changes after activation | 5             | Invalid historical analytics       | State policy, immutable service, direct mutation tests      |
| Phone normalization mismatch        | 6             | Duplicate Respondents              | Country-context tests and canonical E.164/HMAC              |
| Silent replacement abuse            | 6, 8          | Valid response can be displaced    | Accepted risk; uniform behavior, rate controls, auditing    |
| Stale/concurrent autosave           | 7             | Answer loss/corruption             | Revision/idempotency/generation and load tests              |
| Lifecycle race at pause/complete    | 8, 12         | Writes accepted in forbidden state | Transactional state checks and concurrency tests            |
| Snapshot inconsistency              | 9             | Misleading analytics               | One AS-OF cutoff and concurrent-write tests                 |
| Free-text aggregate disclosure      | 9             | Identifying internal result        | Encrypted labels at rest; employee-only aggregate access    |
| XLSX formula injection              | 11            | Workstation compromise             | Explicit text cells and dangerous-prefix test suite         |
| Usage-estimate error                | 12            | Provider pauses before protection  | Conservative calibration, manual actuals, native alerts     |
| Provider free-tier change           | 12, 14        | Loss of `$0` viability             | Reverification release gate; stop rather than substitute    |
| Backup/key loss                     | 13            | Permanent data loss                | Separate key custody and actual restore/decryption drill    |
| Preview/production secret crossover | 0, 14         | Production compromise              | Separate configuration and bundle/environment audits        |

Risk classifications:

- **Highest technical-risk phase:** Phase 9, consistent encrypted ResultsSnapshot calculation under concurrent writes and serverless limits.
- **Highest security-risk phase:** Phases 10–11, because they intentionally release plaintext PII to authorized users and files.
- **Highest data-integrity-risk phase:** Phase 7, autosave revision/idempotency under concurrency and retries.
- **Most likely to consume free-tier capacity unexpectedly:** Phase 7, because autosave dominates request and compute volume. Results/exports are the secondary burst risk.

## M. Recommended first implementation phase

Begin only with **Phase 0 — Repository and engineering foundation**.

The first increment should deliver:

- approved stack scaffolding;
- module and server/client boundaries;
- typed fail-closed configuration;
- CI quality checks;
- redacted logging/error conventions;
- responsive internal/public shells;
- no product data, migrations, real secrets, or deployment.

Stop after its demo and request approval before beginning database migrations or cryptography.

**READY FOR IMPLEMENTATION PLANNING REVIEW**
