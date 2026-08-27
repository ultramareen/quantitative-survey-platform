# Quantitative Survey Platform — Architecture v1.0

**Status:** FROZEN  
**Date:** 25 August 2026  
**Project:** Quantitative Survey Platform  
**Product requirements:** `/docs/Quantitative_Survey_Platform_PRD_v1.0.docx`  
**Implementation plan:** `/docs/IMPLEMENTATION_PLAN.md`

**Source of truth:** This document contains the approved technical architecture for the MVP.

**Change control:** Do not modify architectural or product behavior during implementation without explicit user approval. If PRD and Architecture conflict, implementation must stop and surface the conflict.

**Approved post-v1.0 amendment — 27 August 2026:** Employee onboarding uses a 72-hour, one-time tokenized invitation. This amendment supersedes exact-email-only registration where necessary; exact email and role remain Admin-controlled.

## A. Executive architecture

The MVP is a TypeScript modular monolith built with Next.js, React and Tailwind CSS. It runs on Netlify Free, stores its relational data in CockroachDB Cloud Basic through Prisma, uses self-hosted Better Auth for employee authentication, Resend Free for employee transactional email, and ExcelJS for on-demand XLSX generation.

The mandatory infrastructure cost is `$0` per month. The application must accept throttling or temporary unavailability rather than silently enable paid usage. There is no artificial platform-wide respondent-count cap; capacity protection is driven by relevant free-tier consumption and conservative estimates where provider-authoritative values cannot be obtained programmatically.

The system is one deployable application with explicit internal modules:

- employee authentication and authorization;
- employee invitation and administration;
- survey authoring and lifecycle;
- public sessions and respondent identity;
- response attempts and autosave;
- results calculation and immutable snapshots;
- respondent PII access and XLSX exports;
- infrastructure estimation and capacity protection;
- audit, rate-limit, cryptography and maintenance services.

No Redis, dedicated queue, dedicated background worker, object storage, SMS, OTP, AI service, authentication SaaS, analytics SaaS, session-replay service, or monitoring SaaS is required. The approved Netlify Scheduled Function is a periodic invocation of the same application and is not a separate worker service.

Respondent names, phones and answer payloads are encrypted at application level. Phone equality uses a separate survey-scoped HMAC. Employee permissions are enforced server-side. Results are calculated only on explicit request and persisted as immutable aggregate ResultsSnapshots.

## B. Free-tier infrastructure constraints

Limits below were verified for the frozen architecture on 25 August 2026. They must be rechecked before production launch because provider terms may change.

### Netlify Free

| Resource              | Frozen planning value/behavior                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly credits       | 300 credits per team billing cycle                                                                                                             |
| Web requests          | 2 credits per 10,000 requests, including pages, functions, redirects and static assets                                                         |
| Compute               | 10 credits per GB-hour; Free functions use 1 GB                                                                                                |
| Bandwidth             | 20 credits per GB delivered                                                                                                                    |
| Production deployment | 15 credits per successful production deployment; previews, branch deploys, failed deploys and rollbacks do not consume deployment credits      |
| Function limits       | 60-second synchronous functions; 30-second Scheduled Functions; Free/default memory 1,024 MB; response-size limits remain provider constraints |
| Exhaustion            | Free projects pause until the next cycle or a plan change                                                                                      |
| Native notices        | Provider email/in-app notices at 50%, 75% and 100%                                                                                             |
| Usage API             | No supported exact credit-usage API is part of this architecture; dashboard values are authoritative                                           |
| Scheduled checks      | Scheduled Functions are available and consume ordinary compute credits                                                                         |

The product displays a clearly labelled estimate and allows Admin to enter a dated manual provider-dashboard reading. It never scrapes dashboards or calls undocumented private endpoints.

### CockroachDB Cloud Basic

| Resource         | Frozen planning value/behavior                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Included compute | First 50 million RUs per month                                                                                  |
| Included storage | First 10 GiB                                                                                                    |
| Usage API        | No supported Basic billing-RU endpoint is assumed; provider console/native alerts are authoritative             |
| Native notices   | Organization Admin resource notices at 50%, 75% and 100%                                                        |
| Managed backup   | Approximately every 24 hours with 30-day retention; schedule is not configurable on Basic                       |
| Restore          | Into a completely empty Basic target in the same organization; target is unavailable/overwritten during restore |
| Backup region    | One selected cluster region; a single-region cluster leaves only that region eligible                           |

The production cluster uses single-region AWS `us-east-1`, close to Netlify Free’s Ohio execution. Pricing beyond the allowance is usage-based. Launch is blocked unless Basic can run without a payment method or the current account visibly enforces an exact `$0` limit. A historical resource-limit statement is not sufficient evidence.

### Resend Free

Resend Free provides 3,000 transactional emails per month and 100 per day under the frozen limits. A company-controlled sending domain/subdomain and required DNS records must be verified. Resend carries employee invitations if enabled, password resets and infrastructure alerts only; respondent survey data is never sent to Resend.

### `$0` launch gates and accepted availability

Production launch requires:

1. Netlify remains on Free with paid upgrade/recharge disabled.
2. Cockroach runs without a payment method or with a currently verified `$0` resource limit.
3. Resend remains within Free limits.
4. Native provider notices and application capacity protection are enabled.
5. Load, quota, backup and restore release gates pass.

Netlify may pause the whole application, Cockroach may throttle or reject work, and Resend may reject email at quota exhaustion. The product cannot promise UI, scheduled checks or application email after its hosting runtime has stopped. Provider-native notices and the `$0` account configuration are the final backstops.

### Capacity planning model

This model is for quota planning and testing, never a respondent-count product stop. Assumptions: Opens are approximately 1.25 times identified Respondents; 20 questions average; 80% average coverage; 18–20 autosave attempts per Respondent including retries/toggles; roughly two manual calculations per survey; occasional exports; one or two production deployments.

| Monthly scenario             |         Normal | Higher plausible |   Capacity test |
| ---------------------------- | -------------: | ---------------: | --------------: |
| Identified Respondents       |          5,000 |            7,500 |          10,000 |
| PublicSurveySessions/Opens   |         ~6,250 |           ~9,375 |         ~12,500 |
| Identity requests            |    5,000–5,500 |      7,500–8,250 |   10,000–11,000 |
| Autosaves                    | 90,000–100,000 |  135,000–150,000 | 180,000–200,000 |
| Result calculations          |            ~10 |              ~15 |             ~20 |
| XLSX exports                 |          10–30 |            15–45 |           20–60 |
| Other dynamic calls          |  10,000–15,000 |    15,000–22,000 |   20,000–28,000 |
| Static requests              |  20,000–40,000 |    30,000–55,000 |   40,000–70,000 |
| Netlify request credits      |          25–32 |            38–47 |           50–62 |
| Netlify compute credits      |         80–100 |          120–155 |         160–205 |
| Netlify bandwidth credits    |          10–18 |            15–27 |           20–36 |
| Deploy + quota-check credits |          15–31 |            15–31 |           15–31 |
| **Estimated Netlify total**  |    **130–181** |      **188–260** |     **245–334** |
| Estimated Cockroach RU       |           1–6m |             2–9m |           3–12m |
| Storage growth/month         |       28–50 MB |         42–75 MB |       55–100 MB |

PublicSurveySession, invitations, alerts and snapshots are small compared with encrypted Respondent/attempt data. Netlify’s 300-credit monthly pool is expected to be the first constraint; the 10,000 capacity scenario may cross 95% or exhaust Free depending on actual duration and bandwidth. Production calibration, not Respondent count, controls protection.

## C. System diagram

```text
 Respondent browser                          Employee browser
 - open-token cookie                        - Better Auth session cookie
 - current-attempt cookie                   - role/ownership UI
 - IndexedDB: latest unacknowledged changes
          | HTTPS                                     | HTTPS + CSRF
          +----------------------+--------------------+
                                 v
                  Netlify CDN + Next.js application
                  ┌─────────────────────────────────┐
                  │ public and internal React UI    │
                  │ auth / authorization policies   │
                  │ survey and attempt state rules  │
                  │ AES-GCM / HMAC / Argon2id       │
                  │ autosave / ResultsSnapshot      │
                  │ XLSX / audit / usage estimates  │
                  └──────────────┬───────────┬──────┘
                                 │ TLS       │ HTTPS
                                 v           v
                    CockroachDB Basic     Resend Free
                    - relational schema   - employee email only
                    - encrypted PII
                    - encrypted answers
                    - snapshots/audit

             Netlify Scheduled Function every 3 hours
                  → refresh conservative estimates
                  → latch/email threshold crossings
                  → enforce ≥95% capacity rules
```

Browsers never connect directly to CockroachDB and never receive database credentials or application encryption keys.

## D. Employee onboarding and authentication

The platform has exactly three roles:

- `ADMIN`
- `PRODUCT_MANAGER`
- `RESEARCHER`

Open/domain self-registration is prohibited. `EmployeeInvitation` is the exact-email Admin allowlist and tokenized onboarding authority:

1. Admin enters a normalized exact email and assigns one of the three roles. The MVP has no employee-domain restriction.
2. The invitation starts as `INVITED`. The server generates a cryptographically secure token, stores only its unique hash, sets `token_expires_at` to 72 hours later, and emails `/accept-invitation?token=...`.
3. The invitation page resolves the token server-side, displays the invited email as read-only, and accepts only display name, password, and password confirmation. Browser-supplied email or role is rejected or ignored.
4. In one Serializable transaction the server locks the invitation, verifies its token hash, `INVITED` status, expiry and non-consumption, counts active non-disabled Users and requires fewer than 15, creates the User and Argon2id credential with `role = invitation.assigned_role`, links the invitation, clears its token fields, marks it `REGISTERED`, and writes a safe audit event.
5. Cockroach serialization conflicts receive bounded jittered retries; concurrent acceptance of one invitation can create at most one User.
6. Admin may resend an `INVITED` invitation by atomically replacing its token hash and resetting expiry to 72 hours before sending the new link. The old link becomes invalid immediately. An expired invitation remains `INVITED` but cannot be accepted until resent.
7. Admin may remove an unused invitation, change a registered employee’s role, disable or re-enable an employee. Disabling clears any usable invitation token fields.

All three roles count toward the maximum of 15 while registered and non-disabled. `INVITED` invitations and disabled employees do not count. Re-enable performs the same transactional count. No last-Admin safeguard is included in the MVP; it is a possible future hardening item.

Only Admin may change a role. The role-change transaction updates User and linked EmployeeInvitation, increments `authorization_version`, audits old/new role, and revokes active sessions so prior permissions cannot persist. Additional Admins may be invited through the same workflow; there is no public elevation path.

### Authentication records and controls

- `User`: UUID PK, normalized unique employee email, name, three-role enum, `authorization_version`, `disabled_at`, timestamps.
- `EmployeeInvitation`: UUID PK, normalized unique email, required `assigned_role`, `INVITED/REGISTERED/DISABLED`, nullable unique User FK, inviter/disable metadata, nullable unique token hash and token expiry. `INVITED` requires both token fields; `REGISTERED` and `DISABLED` require both cleared.
- Better Auth account/password records reference User; passwords use Argon2id with at least 19 MiB memory, 2 iterations, parallelism 1, unique 16-byte salt and 32-byte output, subject to Netlify benchmarking.
- AuthSession stores only a hash of a 256-bit token, with 8-hour idle and 7-day absolute expiry.
- PasswordResetToken stores only a hash of a 256-bit token, expires after 30 minutes, and is single-use.
- Reset success revokes outstanding reset tokens and active sessions.
- Production cookies are host-only, `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Employee mutations require CSRF protection and Origin/Host validation.

The initial Admin is created through a controlled non-public bootstrap procedure; no open initial-Admin registration route exists.

## E. Final permission model

All checks occur in server policies and services. Hidden buttons or missing routes are not security boundaries.

| Action                                                                    | PRODUCT_MANAGER          | RESEARCHER               | ADMIN                    |
| ------------------------------------------------------------------------- | ------------------------ | ------------------------ | ------------------------ |
| List/view non-tombstoned surveys and questionnaires                       | Yes                      | Yes                      | Yes                      |
| View operational counters                                                 | Yes                      | Yes                      | Yes                      |
| View aggregate ResultsSnapshots, including grouped free text              | Yes                      | Yes                      | Yes                      |
| Export aggregate ResultsSnapshot without respondent rows/PII              | Yes                      | Yes                      | Yes                      |
| Create/duplicate survey                                                   | Yes                      | Yes                      | Yes                      |
| Edit own DRAFT                                                            | Yes                      | Yes                      | Yes                      |
| Edit another owner’s DRAFT                                                | No                       | No                       | No                       |
| Activate/pause/reactivate/complete own survey                             | Yes, subject to capacity | Yes, subject to capacity | Yes, subject to capacity |
| Calculate own survey in A/P/C state                                       | Yes                      | Yes                      | Yes                      |
| Manage another owner’s lifecycle/calculate                                | No                       | No                       | Yes                      |
| View/search respondent rows, reference IDs, names, phones and raw answers | No (`403`)               | Yes, across surveys      | Yes, across surveys      |
| Current Raw XLSX                                                          | No (`403`)               | Yes                      | Yes                      |
| Archived Attempts XLSX                                                    | No (`403`)               | Yes                      | Yes                      |
| Respondent-level Free Text XLSX                                           | No (`403`)               | Yes                      | Yes                      |
| Manage invitations, roles and employee state                              | No                       | No                       | Yes                      |
| View headline infrastructure bar                                          | Yes                      | Yes                      | Yes                      |
| View infrastructure detail/manual reconciliation                          | No                       | No                       | Yes                      |
| Pause All / cross-owner switch above 95%                                  | No                       | No                       | Yes                      |
| View Admin operational/audit views                                        | No                       | No                       | Yes                      |
| Hard-delete eligible DRAFT / tombstone / view tombstones                  | No                       | No                       | Yes                      |

An owner who is Product Manager may calculate aggregate results without receiving respondent-level PII. Internal computation decryption is a distinct capability from PII read authorization. Product Manager PII requests return `403` before respondent PII is queried or decrypted.

Above 95%, an owner may reactivate their own PENDING survey only when no other survey is ACTIVE. An owner cannot pause or replace another owner’s ACTIVE survey. Admin may perform the atomic cross-owner switch.

## F. Survey schema and lifecycle

### Survey

- UUID PK and independent random 128-bit public ID.
- Owner User FK; title and optional description.
- Status enum: `DRAFT`, `ACTIVE`, `PENDING_CAPACITY`, `COMPLETED`.
- Nullable pause reason: `CAPACITY` or `MANUAL`.
- `state_version` for optimistic transitions.
- `question_count smallint` checked 0–50.
- Optional survey-specific sample maximum/counter may be retained; it is not a platform-wide respondent cap.
- Lifecycle timestamps: launch, pause, completion and latest state change.
- Tombstone fields `deleted_at` and `deleted_by_user_id`.
- Ordinary indexes exclude tombstones where appropriate.

### Question and AnswerOption

- Question UUID PK, Survey FK, position `smallint`, type `SINGLE_CHOICE`, `MULTIPLE_CHOICE` or `FREE_TEXT`, text and required flag.
- Unique `(survey_id, position)` and composite survey-safe keys.
- AnswerOption UUID PK, Question/Survey keys, position `smallint` checked 1–11, text.
- Choice activation requires 2–11 options; free-text requires zero options.
- Activation requires 1–50 valid questions.

The questionnaire instrument becomes immutable on activation: question text, type, required flag, order, options and option order cannot change. Duplication creates a new DRAFT with questionnaire content only; responses, dates, attempts and snapshots are not copied.

### State machine

| Transition                     | Actor       | Preconditions/effect                                                                       |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| `DRAFT → ACTIVE`               | owner/Admin | Non-tombstoned, valid 1–50-question instrument, capacity rule satisfied; freeze instrument |
| `ACTIVE → PENDING_CAPACITY`    | owner/Admin | Reversible manual Pause, reason MANUAL                                                     |
| `ACTIVE → PENDING_CAPACITY`    | system      | At ≥95% primary usage with 2+ ACTIVE, transition all ACTIVE atomically, reason CAPACITY    |
| `PENDING_CAPACITY → ACTIVE`    | owner/Admin | Below 95% normally; at/above 95% only if no ACTIVE exists or Admin atomically switches     |
| `ACTIVE → COMPLETED`           | owner/Admin | Explicit permanent completion; collection closes immediately                               |
| `PENDING_CAPACITY → COMPLETED` | owner/Admin | Explicit permanent completion                                                              |
| `DRAFT → hard deleted`         | Admin       | Only if no open/respondent/attempt/snapshot/history data exists                            |
| `any state → tombstoned`       | Admin       | Data-bearing survey retained; public/ordinary access rejected                              |

No transition leaves COMPLETED in MVP. Calculate Results is allowed for COMPLETED but never changes its state or reopens respondent writes. All transition services lock required Survey/InfrastructureControlState rows, check `state_version`, enforce the graph, and audit. Database checks enforce enum/field coherence; UI is not authority.

## G. PublicSurveySession

PublicSurveySession represents an Open, not a Respondent.

- UUID PK and Survey FK.
- Unique SHA-256 hash of a 256-bit random open-token cookie.
- `first_opened_at`, `last_seen_at` and nullable Respondent FK after identification.
- `created_while_status` records ACTIVE/PENDING_CAPACITY for interpretation, not authorization.
- No name, phone, IP, user agent or answers.

Opening an ACTIVE or PENDING_CAPACITY public URL creates or reuses the minimal PII-free session. A valid open or current-attempt token reuses its linked session and does not increment Opened. Clearing cookies, private browsing or a different device produces a different Open. Multiple sessions may later link to one Respondent and still remain separate Opens.

Open and attempt cookies have a 90-day maximum lifetime and may be invalidated earlier by archival, tombstone or security action. Server state and token hashes are authoritative.

While PENDING_CAPACITY, a new visitor still creates/reuses PublicSurveySession and sees “This survey is temporarily not accepting new responses.” They cannot enter name/phone and no Respondent or ResponseAttempt is created. This Open remains in the analytics denominator by product decision.

DRAFT, COMPLETED and tombstoned public routes remain closed/unavailable and do not introduce alternate respondent flows.

## H. Respondent

Respondent is created only after name and phone are accepted on an ACTIVE survey.

- UUID remains the internal PK.
- `reference_id` is globally unique and immutable: `R-` plus 12 uppercase Crockford Base32 characters generated from 60 cryptographically random bits, for example `R-7K3M9W2X8Q4D`. Collision retries use the unique constraint.
- Encrypted name: ciphertext, nonce and key version.
- Encrypted phone: ciphertext, nonce and key version.
- `phone_lookup_hash`: survey-scoped HMAC-SHA-256 over Survey ID plus normalized E.164.
- Identification/activity and future anonymization/retention timestamps.
- Unique partial `(survey_id, phone_lookup_hash)` and search index on reference ID.

Phone input includes country selector/dialing context. The server normalizes to E.164 before HMAC, encryption or comparison and rejects ambiguous local numbers instead of guessing a country.

Reference ID is a non-sequential employee workflow locator, not a bearer credential. It grants no public access. Exact lookup requires an authenticated Researcher/Admin. Product Managers do not receive respondent IDs linked to answers or respondent-level records.

Multiple PublicSurveySessions may link to the same Respondent. Respondent analytics deduplicate by survey-scoped Respondent; Opened remains session-based.

## I. ResponseAttempt lifecycle

ResponseAttempt persists only `CURRENT` and `ARCHIVED`. Locked/final is derived.

Core fields:

- UUID PK; Survey, Respondent and originating PublicSurveySession FKs.
- Status `CURRENT` or `ARCHIVED`.
- Attempt number and generation.
- Nullable unique hash of the 256-bit browser attempt token.
- AES-GCM encrypted compact answer payload, nonce, key version and schema version.
- Payload revision, last mutation ID and save count.
- Answered-question count and frozen coverage-basis count, each bounded by the 50-question limit.
- Created, started, activity, last-answer-change and archive timestamps/reason.
- Unique `(respondent_id, attempt_number)` and partial unique `(respondent_id) WHERE status='CURRENT'`.

Derived edit deadline:

`editable_until = COALESCE(last_answer_changed_at, attempt_created_at) + 24 hours`

A successful logical answer change, including deleting an answer, sets `last_answer_changed_at` to server transaction time. Idempotent replay without a new logical change, reading, reopening or Submit does not extend the window. An empty identified attempt locks 24 hours after creation.

| Condition                  | Analytics                                    | Autosave                 | Same-device behavior | New-device behavior                |
| -------------------------- | -------------------------------------------- | ------------------------ | -------------------- | ---------------------------------- |
| CURRENT editable + ACTIVE  | Included                                     | Allowed                  | Restore/edit         | Silent blank replacement allowed   |
| CURRENT locked + ACTIVE    | Included                                     | Rejected                 | Recorded message     | Silent blank replacement allowed   |
| CURRENT editable + PENDING | Included                                     | Allowed with valid token | Restore/edit         | Identification/replacement blocked |
| CURRENT locked + PENDING   | Included                                     | Rejected                 | Recorded message     | Blocked                            |
| CURRENT + COMPLETED        | Included in requested snapshots              | Rejected                 | Recorded/closed      | Blocked                            |
| ARCHIVED                   | Excluded from standard analytics/current raw | Always rejected          | Never restored       | N/A                                |
| Any + tombstone            | Excluded from ordinary access                | Rejected                 | Unavailable          | Rejected                           |

Same-device valid-token resolution occurs before duplicate-phone replacement. Within the edit window it restores the same CURRENT attempt and answers. After expiry it shows “Your response has already been recorded” and does not automatically create another attempt.

On ACTIVE, a browser without the valid CURRENT token may enter the same phone. The public flow does not disclose that the phone or prior attempt exists. In one transaction the server locks Respondent/current attempt, archives the old CURRENT, revokes its token, preserves its encrypted payload, creates a blank next-generation CURRENT attempt, and issues the new token after commit. This applies regardless of old coverage or lock state. Latest attempt wins.

## J. Autosave and local pending recovery

The database is canonical. The cookie stores identity only, never answers.

Each answer mutation includes question position/value, attempt generation, base revision and random mutation ID. In one transaction the server:

1. resolves the hashed attempt token;
2. enforces survey/attempt lifecycle and edit deadline;
3. resolves repeated mutation IDs idempotently;
4. decrypts/authenticates the compact payload;
5. validates the answer against the immutable question/options;
6. applies one logical change;
7. recomputes answer count;
8. encrypts with a fresh nonce;
9. increments revision/save count and records the server change timestamp.

Conditional revision failure returns current state; stale data never silently overwrites newer data. Cockroach serialization conflicts receive bounded jittered retries. Client behavior is single-choice immediate, multiple-choice short debounce, and free-text 500–1,000 ms plus blur/Submit flush, with one mutation in flight and Saving/Saved/Retry states.

IndexedDB stores only the latest unacknowledged mutation per survey/question: public survey ID, question position, proposed value, mutation ID, base revision and local timestamp. It contains no respondent name/phone, authentication or attempt token, encryption key, acknowledged history or full answer payload.

Pending entries are deleted after acknowledgement and purged on locked/archived/completed/tombstoned/invalid-token responses, successful replacement, browser reset/logout, or 24 hours after local creation. On reopen they retry only after the server confirms the cookie maps to the same editable CURRENT attempt.

Temporary free-text values are plaintext in the browser profile and may be exposed to a person or malware with profile access. Local encryption with a locally stored key does not materially solve that threat. Retention is minimized; this is not an offline-first replica and does not synchronize across devices.

## K. Results calculation

Question analytics are never continuously recalculated on autosave or Results-page view. Before a snapshot exists, employees may see only clearly labelled cheap operational counters such as Opened sessions, identified Respondents, CURRENT attempts and stored coverage counts.

The survey owner or Admin explicitly invokes Calculate Results. It is permitted when a non-tombstoned survey is:

- `ACTIVE`;
- `PENDING_CAPACITY`;
- `COMPLETED`.

Calculation never invokes the survey transition service, never reopens COMPLETED, and never permits respondent writes. Each accepted calculation creates a new immutable ResultsSnapshot. Existing snapshots are never overwritten or recalculated; the Results page shows the latest by default and retains history.

Calculation flow:

1. Authorize owner/Admin and A/P/C state.
2. Select one safe Cockroach historical cutoff approximately five seconds behind current database time.
3. Read PublicSurveySession, Respondent and CURRENT ResponseAttempt data in keyset pages using the exact same `AS OF SYSTEM TIME` cutoff.
4. Batch-decrypt/authenticate CURRENT answer payloads in memory.
5. Aggregate funnel and question results; ARCHIVED attempts are excluded.
6. Recheck non-tombstoned eligible state.
7. Insert one immutable aggregate snapshot and audit.

A Product Manager owner may invoke calculation, but the returned/persisted output is aggregate-only. Internal server-side decryption for computation grants no respondent-read permission and must not serialize respondent records or log plaintext.

## L. Analytics definitions

At the snapshot cutoff:

- **Opened:** count unique PublicSurveySession rows. It includes Opens created during PENDING_CAPACITY. Multiple devices/cookies may count as multiple Opens even when they later map to one phone.
- **Identified Respondents:** survey-scoped Respondents existing at the cutoff; this is an operational count separate from Opened.
- **Started:** CURRENT attempts with `answered_question_count >= 1`.
- **> 50%:** CURRENT attempts with answer count strictly greater than half of the frozen question/coverage basis.
- **Completed:** CURRENT attempts with answer count equal to all survey questions, including optional questions.
- Locked and editable CURRENT attempts count equally. ARCHIVED attempts never count.
- Started, >50% and Completed percentages use Opened as denominator. Zero Opened produces 0%, not division failure.

PENDING-only visitors can increase only Opened. Existing valid attempts may continue during PENDING and can naturally progress from Started to >50% to Completed. Because paused Opens remain in the denominator, they may lower funnel percentages; this is intentional.

For each question, the denominator is the number of CURRENT attempts with a valid nonempty answer for that question.

- **Single choice:** show every option in instrument order with count and denominator percentage, including zeros.
- **Multiple choice:** count distinct answering Respondents selecting each option; denominator is Respondents answering the question; percentages may total above 100%.
- **Free text:** trim and group Unicode-aware case-insensitively while retaining encrypted originals. If there are at most 10 unique normalized groups, show all. Otherwise show Top 10 and provide the authorized respondent-level XLSX.
- **Leader rule:** highlight every option/group tied for the highest positive count. If all counts are zero, highlight nothing.

No charts/visualizations are required in MVP.

## M. XLSX behavior and security

Export permissions:

- Product Manager: aggregate ResultsSnapshot export without respondent rows or PII.
- Researcher/Admin: aggregate export plus Current Raw, Archived Attempts and respondent-level Free Text exports.

Current Raw contains one Respondent plus CURRENT attempt per row. Archived Attempts is separate and never enters regular analytics/current raw. Free-text respondent export includes Respondent Reference ID, decrypted name, decrypted phone and raw original answer for authorized Researcher/Admin.

Exports are generated on demand with ExcelJS, batch-query/decrypt data, stream the response and retain no permanent file. There is no object storage, public download URL or public cache. Responses use authenticated attachment headers, correct XLSX MIME type, `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and `X-Content-Type-Options: nosniff`.

Every respondent-controlled value is an explicit text cell. If the first non-whitespace character is `=`, `+`, `-`, `@`, tab, CR or LF, prefix an apostrophe. Never construct formula objects from respondent data.

Each respondent-level export is audit logged without embedding plaintext PII in the audit record. A synchronous export is guarded by predicted response bytes and execution time, not a respondent product cap. Oversized datasets use deterministic respondent/time partitions across separate bounded downloads; no queue or stored file is introduced.

## N. Encryption and key management

Respondent name, phone, answer payloads and answer-derived free-text snapshot labels use AES-256-GCM. Every encryption uses a cryptographically random 96-bit nonce, 128-bit authentication tag, key version and purpose/record/version AAD.

Independent server-side secrets:

- `PII_ENCRYPTION_KEY_Vn`: respondent fields, answer payloads and ResultsSnapshot free-text label envelopes.
- `PHONE_LOOKUP_HMAC_KEY_Vn`: HMAC of Survey ID plus normalized E.164 for equality/unique lookup.
- `RATE_LIMIT_HMAC_KEY`: short-lived IP-prefix, employee-email and other low-entropy abuse-control subjects; never reused for phone or encryption.
- `BACKUP_ENCRYPTION_KEY`: independent full logical backup archive encryption; kept outside ordinary application runtime and separate from archives.
- Better Auth/session secrets remain independent of all keys above.

Secrets are never `NEXT_PUBLIC_*`, source-controlled, logged, stored in the database or exposed to preview. Preview uses unrelated keys and synthetic data.

Rotation never mutates ordinary GET/read requests. Add a new key version, use it for all new writes, and run a separate authenticated resumable maintenance process in bounded batches with checkpoints and verification. Keep the old key through migration and relevant backup retention, then retire it. HMAC rotation uses a versioned secondary lookup column/index during backfill. Short-lived rate-limit records may simply expire.

Database-dump target: without application secrets, an attacker cannot read respondent names, phones, choice answers, multiple-choice answers, raw free text or answer-derived free-text snapshot labels. Instrument text, employee identity, password verifiers, relationships, timestamps, operational counts, numeric aggregates, ciphertext sizes and keyed hashes remain visible.

## O. PII behavior

Respondent-level plaintext is available only to `RESEARCHER` and `ADMIN`. Central server policy checks the current authenticated role before querying/decrypting respondent PII. Product Manager direct calls receive `403` before PII is loaded or decrypted; field omission and UI hiding are not relied upon.

Authorized Researcher/Admin views may show:

- Respondent Reference ID;
- decrypted name and phone;
- survey;
- CURRENT coverage;
- start and last-answer-change timestamps;
- derived editable/locked state;
- approved raw answers and exports.

Phone plaintext is intentionally visible to Researcher/Admin for qualitative follow-up. Reference-ID search may span surveys. The internal view never exposes ciphertext, nonce, key version, phone HMAC or browser token.

Names, phones and answer bodies never appear in URLs or normal logs. PII responses are private/no-store. Aggregate ResultsSnapshots remain visible to all authenticated roles, including grouped free-text values, but Product Managers receive no respondent linkage or click-through to identity.

Audit records capture actor, action, target/survey, timestamp, result and row count where appropriate, but never decrypted name, phone or answer body.

## P. Infrastructure monitoring and alerts

All authenticated employees see:

`Estimated Infrastructure Usage — N%`

The headline is the maximum of estimated/manually reconciled Netlify credits, Cockroach RU and Cockroach storage. Resend daily/monthly usage appears in Admin detail but does not drive survey pausing. Colors: green below 50%, yellow 50–74.99%, orange 75–89.99%, strong orange 90–94.99%, red 95–98.99%, critical red at or above 99%.

Every reading displays its source and update time:

- `APPLICATION_ESTIMATE` for conservative application estimates;
- `MANUAL_ACTUAL` for dated Admin provider-dashboard reconciliation;
- `PROVIDER_ACTUAL` only if a supported provider endpoint exists.

Stale readings older than six hours are labelled stale. Admin detail shows quota, used/limit, percentage, source, period/reset, update time and provider-console link.

### Usage records and source of truth

- `InfrastructureUsageSnapshot`: provider/quota/period, used, limit, percent, source, collection time and allowlisted no-PII detail.
- `InfrastructureEstimateBucket`: low-write deterministic samples of request count/duration/response bytes.
- `InfrastructureDeployment`: idempotent observed production deploy IDs for exact application-observed deployment-credit count.
- `InfrastructureControlState`: cached primary percent/provider/source, evaluation time and protection state.

Netlify credits are estimated from domain/request counts, sampled duration/bytes, static-asset multiplier and production deployment IDs. Cockroach RU/storage are conservatively modelled and calibrated to the provider console. Resend application send counters are exact because all sends use one adapter.

A Netlify Scheduled Function runs every three hours (about 240 calls per 30 days). At 1 GB and 0.25–1 second per invocation, its planning cost is approximately 0.17–0.67 credits per month. Dashboard loads read cached state and may request a refresh only when stale; public requests never call provider APIs.

### Alert thresholds

All active Admins receive product email at 50%, 75%, 90%, 95% and 99% for relevant provider/quota periods. `InfrastructureAlertDelivery` has a unique provider/quota/period/threshold latch. Multiple crossings in one check may be consolidated into one email while preserving each latch. Successful alerts do not repeat within the same period; failed sends receive bounded retry.

Provider-native 50/75/100 alerts remain enabled. If Resend itself is near its limit, its 99% product email may fail; earlier warning, cached UI and provider dashboard remain backstops. Resend exhaustion never drives respondent-capacity pausing.

## Q. PENDING_CAPACITY capacity protection

PENDING_CAPACITY is a reversible operational pause, not completion, history, archive or deletion.

While PENDING:

- survey remains visible in Active/Operational with a paused badge and retains its public URL;
- new public visitors create/reuse only PII-free PublicSurveySession, count as Opened and receive the temporary-unavailable message;
- no new Respondent or ResponseAttempt is created and name/phone is not accepted;
- valid existing editable CURRENT attempt cookies may reopen, restore and autosave;
- locked attempts cannot edit;
- new-device identification/replacement is blocked;
- snapshots, authorized views and exports remain available subject to provider availability.

At the first capacity evaluation at or above 95%:

- zero ACTIVE: no transition;
- exactly one ACTIVE: it remains ACTIVE and is not automatically paused;
- two or more ACTIVE: lock control/survey rows and atomically move all ACTIVE surveys to PENDING_CAPACITY, audit the batch and notify Admins.

At/above 95%, at most one non-tombstoned survey may be ACTIVE. If none is ACTIVE, an owner may reactivate their own eligible PENDING survey and Admin may reactivate any. If one is ACTIVE, only Admin may atomically switch across owners by pausing the current survey and activating the selected survey in one transaction. No confirmation path may leave two ACTIVE.

Admin-only Pause All atomically moves every ACTIVE survey to PENDING_CAPACITY with MANUAL reason and audits actor/count. There is no automatic resume after usage falls or a quota resets.

At 99%, send critical Admin email and show critical-red UI. Do not complete, archive or automatically pause the selected single ACTIVE survey. Admin retains Pause, Switch and Pause All. Provider exhaustion may still make the application unavailable.

## R. ResultsSnapshot consistency model

ResultsSnapshot fields:

- UUID PK, Survey FK and creator User FK.
- `created_at`.
- `data_cutoff_at` display timestamp.
- exact `data_cutoff_system_time` used by every Cockroach `AS OF SYSTEM TIME` read.
- Opened, identified Respondent, CURRENT attempt, Started, >50% and Completed counts.
- `result_payload JSONB` for funnel, single/multiple-choice aggregates and free-text denominator/unique-group/truncation metadata.
- `free_text_result_ciphertext`, nonce and key version for answer-derived normalized/display group strings and counts.
- result schema version and optional diagnostic source fingerprint.
- index `(survey_id, created_at DESC)`.

Every source query uses the exact same historical cutoff with keyset pagination. This prevents an autosave during calculation from creating internally inconsistent counts without holding a long-running database transaction during decryption. ARCHIVED rows are excluded in the as-of predicate.

The JSONB/snapshot contains no respondent UUID/reference ID, name, phone, session ID, attempt ID, raw free-text list or respondent-to-answer mapping. Free-text aggregate labels are encrypted at rest because even grouped strings may identify a person. Authorized aggregate views decrypt only that envelope and combine it with non-text JSONB metadata.

Snapshots are insert-only. Runtime code cannot update or delete them. Tombstoning hides them from ordinary lists but preserves history. Each Calculate Results invocation in ACTIVE, PENDING_CAPACITY or COMPLETED creates another snapshot; no snapshot is overwritten and survey state is unchanged.

## S. Backup and restore

### Managed backup

Cockroach Basic managed backup runs approximately every 24 hours with 30-day retention and restores only into a completely empty Basic target in the same organization. Restore replaces/makes the target unavailable. Backup page, schedule behavior and single-region location must be verified before launch.

### Independent zero-cost backup

Before every risky schema/data migration and monthly, a named custodian uses the current provider-supported logical export procedure from a controlled machine. Encrypt the entire archive with an established authenticated tool and the separate backup key. Application ciphertext alone is insufficient because employee data, instrument and numeric aggregates are visible in a database dump.

Keep three rolling monthly copies plus the relevant pre-migration copy in an approved company-controlled encrypted location/device already available at no added cost. Never use Git, Netlify assets, public buckets or unapproved personal cloud drives. Backup key and archives are stored separately; two named custodians retain recovery material and application key versions.

Before production, perform an actual drill:

1. Create an empty nonproduction Basic target.
2. Restore the independent backup.
3. Start the application with isolated restored credentials.
4. Verify migrations, schema and constraints.
5. Authorize and decrypt a synthetic sample with application keys.
6. Verify survey, PublicSurveySession, Respondent, CURRENT/ARCHIVED attempt and ResultsSnapshot integrity.
7. Securely destroy the restore environment.

Repeat quarterly and after material backup-tool/provider changes. Record RPO/RTO and result without PII. A successful drill is a release gate.

## T. Threat model and accepted risks

| Threat/limitation                 | Controls                                                                                               | Accepted residual risk                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Database dump/provider compromise | AES-GCM PII/answers/free-text labels; separate keys; TLS/provider at-rest encryption                   | Instrument, employee data, metadata, numeric aggregates and keyed hashes remain visible; dump plus keys exposes PII |
| Runtime/database credential leak  | Server-only secrets, least privilege, separate runtime/migration/maintenance roles, preview separation | Managed endpoint remains reachable with valid credentials; static Free egress limits IP allowlisting                |
| Broken authorization              | Three-role enum, role from invitation, central policies, separate aggregate/PII DTOs, negative tests   | A policy defect can expose data                                                                                     |
| Stale role/session                | Authorization version, session revocation after role/disable changes                                   | A response already delivered cannot be recalled                                                                     |
| Authorized employee misuse        | Product Managers receive no respondent PII; PII export/access auditing                                 | Authorized Researcher/Admin can copy, photograph or redistribute plaintext                                          |
| Public bots/enumeration           | Random public IDs, uniform errors, body/rate limits, optional zero-cost bot control                    | Leaked links and cookie clearing inflate Opened                                                                     |
| Opened metric identity            | Cookie token and exact session reuse                                                                   | It identifies browser/cookie sessions, not humans; multiple devices are multiple Opens                              |
| Attempt-token theft               | Random hash-only token, Secure/HttpOnly/SameSite cookie, archive revocation, XSS controls              | A compromised/shared browser may expose its current response                                                        |
| Silent same-phone replacement     | Uniform response, atomic replacement, rate controls                                                    | A person knowing another phone can displace a valid CURRENT response while ACTIVE; accepted MVP risk                |
| IndexedDB pending data            | Latest unacknowledged only, no token/identity/full payload, ack/24-hour purge, CSP                     | Temporary free-text plaintext is visible to browser-profile access/malware                                          |
| Stale autosave                    | Revision, mutation ID, generation, atomic transaction, one in-flight mutation                          | Conflicts may require visible retry                                                                                 |
| Snapshot inconsistency            | Exact AS-OF cutoff for every page and immutable insert                                                 | Snapshot is intentionally a few seconds behind current time                                                         |
| Aggregate free text               | Encrypted at rest, authenticated employee-only display                                                 | Rare groups may identify a person and remain confidential internal research data                                    |
| Spreadsheet injection             | Explicit text cells, dangerous-prefix apostrophe, no formula object                                    | Authorized download leaves application control                                                                      |
| Usage estimate error              | Conservative calibration, three-hour checks, manual actuals, native alerts, `$0` account guard         | Estimate can differ from actual; sudden spikes can exhaust provider before protection                               |
| Free-tier exhaustion              | 95% protection, native alerts, no paid upgrade                                                         | Netlify/Cockroach may pause/throttle; no paid SLA or guaranteed availability                                        |
| Resend exhaustion                 | Early thresholds, cached UI, provider dashboard                                                        | Critical product email can fail when Resend is exhausted                                                            |
| Key loss/rotation defect          | Versioned keys, two custodians, maintenance-only rotation, restore drill                               | Loss of all required keys makes ciphertext unrecoverable                                                            |
| Data residency                    | US East Cockroach and Netlify Ohio selected for latency/free-tier compatibility                        | US processing is accepted subject to company privacy approval; architecture is not EU-only                          |

Baseline controls include HTTPS/TLS, parameterized Prisma access, strict request schemas and size limits, React text escaping, CSP/HSTS/nosniff/referrer/frame headers, CSRF/Origin checks, generic auth/reset responses, short-lived HMAC rate buckets, no PII logs, synthetic preview data and no production secrets in preview.

## U. Implementation invariants

The implementation must never violate these rules. Database constraints and transactions are preferred for data invariants; server policy is mandatory for authorization. UI is supportive only.

| Invariant                                                           | Required enforcement                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Maximum 15 active registered employees                              | Serializable invitation registration/re-enable transaction; count non-disabled Users; `INVITED` rows do not count; concurrency tests |
| Invitation is 72-hour, hash-only and single-use                      | Unique token hash, expiry and lifecycle constraints; locked transactional consumption; resend rotates hash |
| Role originates only from Admin invitation                          | Locked token-resolved exact-email invitation; server copies `assigned_role`; client cannot select role  |
| Product Manager receives no respondent PII                          | Central PII policy returns `403` before respondent query/decryption; separate DTOs and direct API tests |
| Researcher/Admin only for respondent plaintext/XLSX                 | Server role policy on every view/search/export; audit PII exports                                       |
| Instrument immutable after activation                               | Survey mutation service requires DRAFT; state/version and direct API tests                              |
| 1–50 questions and 2–11 choice options at activation                | Activation transaction plus DB bounds and boundary tests                                                |
| Exactly one CURRENT attempt per Respondent                          | Partial unique DB index plus transactional replacement                                                  |
| Valid same-device token restores rather than replaces               | Resolve current token before duplicate-phone handling                                                   |
| New-device same-phone silently replaces                             | Atomic lock/archive/revoke/create; no duplicate disclosure                                              |
| ARCHIVED excluded from standard analytics/current raw               | All standard queries explicitly require CURRENT; archive export separate                                |
| 24-hour edit window uses last successful logical change             | Server time; derived deadline; idempotent/no-op/open/Submit do not extend                               |
| Locked and COMPLETED reject answer writes                           | Lifecycle policy inside every mutation transaction                                                      |
| PENDING blocks new identity but not valid existing editable attempt | Separate public-open, identification and autosave policies                                              |
| PENDING Opens remain in denominator                                 | PublicSurveySession persisted and counted at snapshot cutoff                                            |
| Stale autosave cannot overwrite newer data                          | Base revision, generation, mutation idempotency and conditional transaction                             |
| Answer contents are encrypted at rest                               | AES-GCM payload; direct database inspection tests for single/multiple/free text                         |
| Results use one logical cutoff                                      | Same exact Cockroach AS-OF timestamp for every keyset page                                              |
| ResultsSnapshot aggregate-only and immutable                        | No respondent linkage, insert-only runtime service/privileges                                           |
| Calculate Results allowed only in ACTIVE/PENDING/COMPLETED          | Owner/Admin state policy; calculation never calls transition service                                    |
| Repeated calculations create new snapshots                          | New insert per accepted request; no overwrite/update path                                               |
| Keys never reach browser                                            | Server-only modules/env, client-bundle inspection and preview isolation                                 |
| Plaintext PII never enters logs/URLs                                | Allowlisted structured logging and safe routing/error tests                                             |
| ≥95% with exactly one ACTIVE leaves it ACTIVE                       | Capacity evaluator 0/1/2+ branch and acceptance test                                                    |
| ≥95% cannot operate more than one ACTIVE after selection            | Control-state/survey locking and atomic Admin switch                                                    |
| Tombstoned data absent from ordinary access                         | Default `deleted_at IS NULL` policy; public writes rejected; Admin special path only                    |
| No paid infrastructure silently activated                           | External account settings, provider verification and production release gate                            |

Any implementation discovery that makes an invariant technically impossible is a stop condition requiring explicit user approval. It must not be replaced with alternate behavior.
