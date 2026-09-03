# Manual Production QA Tracker

This file is the persistent source of truth for issues found during manual production testing. New issues receive sequential IDs. A regression reopens the existing issue. Implementation or deployment alone does not qualify as production verification; an issue is marked **Verified in production** only after its acceptance criteria have been checked against the deployed production version.

Allowed statuses: **Reported**, **In Progress**, **Fixed — awaiting production verification**, **Fixed — awaiting manual production verification**, **Verified in production**, **Not fixed**, **Won't fix**.

## QA-001

- **ID:** QA-001
- **Date reported:** 2026-09-01
- **Area / screen:** Internal Shell / authenticated entry
- **Original user-reported problem:** Immediately upon entering Internal Shell, before I have done anything, I see: “Your session is missing or expired. Sign in to continue.” This is confusing because there has been no visible session expiry or preceding user action.
- **Expected behaviour / acceptance criteria:** A valid authenticated user must not see a stale or misleading session-expired message on normal entry. If authentication is genuinely missing, route through the correct sign-in/authentication flow instead of rendering an unexplained shell error. Eliminate any incorrect transient state caused by an initial unauthenticated request, hydration/race condition, stale client state, or similar implementation detail. Preserve fail-closed authentication and existing security boundaries.
- **Status:** Verified in production
- **Root cause:** The internal layout redirected every failed session lookup to `reason=session-required`, including a normal first visit with no session cookie. The public home page links directly to `/app`, and the sign-in page rendered that undifferentiated reason as “missing or expired.” This was deterministic server routing, not a client hydration race; valid sessions remain validated server-side and enter the shell.
- **Implementation summary:** Missing or invalid authentication still fails closed and routes to sign-in, but the ordinary authentication redirect no longer supplies or renders a misleading expiry notice. The password-reset success notice remains intact.
- **Tests / verification performed:** Added sign-in notice coverage for normal authentication routing and password-reset success. Existing auth service, plugin, policy, cookie, CSRF, and boundary tests passed in the 226-test unit/architecture suite. Typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan passed. Database rehearsal was not run because the host lacks the required `cockroach` executable.
- **Production verification status:** Verified in production. The unauthenticated routing check passed on 2026-09-02 at deployed commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`, and the user subsequently confirmed during manual production testing on 2026-09-03 that the remaining authenticated-entry behaviour works as expected.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-002

- **ID:** QA-002
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / question controls
- **Original user-reported problem:** In survey creation, Add option is currently positioned incorrectly.
- **Expected behaviour / acceptance criteria:** Move Add option into the same question action row as Move up / Move down / Remove question. It is visually grouped with those question-level controls, green, and maintains clean spacing and responsive behaviour.
- **Status:** Verified in production
- **Root cause:** The Add option control was rendered in the answer-options heading, separately from the question action row.
- **Implementation summary:** Moved Add option into the responsive question action row and styled it as a green action without changing option limits or question semantics.
- **Tests / verification performed:** Added UI assertions for grouping, green styling, and existing option-limit behavior. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Verified in production by the user during manual testing on 2026-09-03 at the deployed QA-001–QA-008 implementation; Add option placement and behaviour work as expected.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-003

- **ID:** QA-003
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / questionnaire editor
- **Original user-reported problem:** Add question is currently at the top of the form. This becomes unusable when editing a long survey because the user has to scroll back to the top to add question 10, 15, etc.
- **Expected behaviour / acceptance criteria:** Move Add question to the bottom of the questionnaire editor, immediately above the Save Draft / activation action area, and keep it easy to reach after editing the last question.
- **Status:** Verified in production
- **Root cause:** Add question was part of the questionnaire heading row before the mapped question list.
- **Implementation summary:** Moved Add question after the questionnaire list and immediately before the final Save Draft / Activate action area.
- **Tests / verification performed:** Added a DOM-order assertion proving Add question precedes the final action group after the question list. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Verified in production by the user during manual testing on 2026-09-03 at the deployed QA-001–QA-008 implementation; Add question placement works as expected.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-004

- **ID:** QA-004
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / answer options
- **Original user-reported problem:** Questions can currently be reordered with Move up / Move down, but answer options cannot be reordered.
- **Expected behaviour / acceptance criteria:** Original acceptance requested answer-option reordering and led to drag handles plus arrow alternatives. Manual production testing reopened the issue with corrected criteria: remove all option and question move arrows and dedicated drag handles; drag the option block itself only within its question; drag the structural question card to reorder questions; never initiate parent/question dragging from answer-option dragging or from interactive descendants; preserve ordinary text editing and control interaction; show active drag feedback; and persist both nested orders after save/reload.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The builder stored options as an ordered array and the repository already persisted array order by position, but the UI exposed no option-reordering interaction.
- **Implementation summary:** The first implementation (`3cc031a053fbdcab8c1cf854ba158dc9573f2d83`) added option drag handles and arrow alternatives. After the 2026-09-03 production finding, the reopened implementation removes those controls and the question Move up/Move down buttons. Question fieldsets and option rows are now the draggable structural surfaces, with distinct drag MIME types, question-scoped option validation, propagation isolation between nesting levels, interactive-descendant suppression, and active visual feedback. The existing ordered arrays and draft persistence path continue to save the resulting order.
- **Tests / verification performed:** Replaced the original handle/arrow assertions with option-block and question-card drag tests, absence checks for all arrows/handles, cross-question rejection, nested-drag isolation, interactive-control suppression/editability, active drag feedback, exact option/question save order, and saved-order rendering after reload. The complete 247-test suite, typecheck, lint, formatting, production build, Prisma validation, client-bundle scan, and production-artifact scan passed.
- **Production verification status:** Reopened on 2026-09-03 after the user manually found that the first production implementation exposed too many competing reorder controls and lacked card-level question dragging. The corrected implementation is local only and awaits production deployment and manual verification.
- **Relevant commits:** First implementation `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`; reopened correction `d2340db15a8b71324679c7c4b4253615429ed029`.

## QA-005

- **ID:** QA-005
- **Date reported:** 2026-09-01
- **Area / screen:** Survey editor / Duplicate Draft
- **Original user-reported problem:** Currently, clicking Duplicate Draft appears to do nothing. After a delay, the title simply changes to: “[original title] (Copy)”. This creates the impression that the button is broken.
- **Expected behaviour / acceptance criteria:** Immediately disable duplicate/repeated submission and show a clear loading state, overlay, or transition for the actual operation duration without artificial delay. On success show the duplicated draft normally; on failure show a visible error.
- **Status:** Verified in production
- **Root cause:** The duplicate request used a shared internal busy flag only to disable controls; the duplicate button text and page content gave no operation-specific pending feedback while the request was in flight.
- **Implementation summary:** Duplicate now synchronously locks repeated submission, changes its button label, and displays an accessible content-blocking “Duplicating survey…” overlay for the real request duration. Failures remain visibly rendered and success navigates to the copied draft without artificial delay.
- **Tests / verification performed:** Added a deferred-request UI test proving immediate pending feedback, disabled repeat submission, one network request, and navigation on success. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Verified in production by the user during manual testing on 2026-09-03 at the deployed QA-001–QA-008 implementation; duplicate feedback and completion work as expected.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-006

- **ID:** QA-006
- **Date reported:** 2026-09-01
- **Area / screen:** Survey editor / final actions
- **Original user-reported problem:** Activate is currently at the top of the page.
- **Expected behaviour / acceptance criteria:** Keep Activate in the final action row beside grey/secondary Save Draft as a green/primary action. Manual production testing added the missing requirement that Activate becomes available as soon as the current editor contains a valid activatable survey, including a never-saved new survey, and never depends on a prior manual Save Draft. Activation must persist the current visible editor state before transitioning and must retain server validation.
- **Status:** Fixed — awaiting production verification
- **Root cause:** Activate was owned and rendered by the page-level SurveyActions header while Save Draft was rendered independently at the end of SurveyBuilder.
- **Implementation summary:** The first implementation (`3cc031a053fbdcab8c1cf854ba158dc9573f2d83`) moved the existing transition control into the footer but left it disconnected from unsaved editor state. The reopened implementation makes the builder own the activation flow: it derives readiness from the same title/question/option constraints enforced server-side, saves the current draft payload first, and only then requests the existing guarded ACTIVE transition. It supports both new and existing Drafts without stale-content activation or a separate Save Draft click; non-draft lifecycle actions remain unchanged.
- **Tests / verification performed:** Added tests proving disabled invalid activation, immediate availability for valid current state, create-and-activate without prior save, existing-draft unsaved-state persistence before transition, exact transition version/body, and unchanged server-side activation validation coverage. The complete 247-test suite and all local quality gates passed.
- **Production verification status:** Reopened on 2026-09-03 after the user manually verified that the first production implementation showed Activate only after Save Draft. The corrected flow is local only and awaits production deployment and manual verification.
- **Relevant commits:** First implementation `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`; reopened correction `d2340db15a8b71324679c7c4b4253615429ed029`.

## QA-007

- **ID:** QA-007
- **Date reported:** 2026-09-01
- **Area / screen:** Activated survey / Public URL
- **Original user-reported problem:** After survey activation, the Public URL is displayed. Add a copy-to-clipboard icon/button directly beside the URL.
- **Expected behaviour / acceptance criteria:** Clicking the adjacent icon-only control copies the complete usable URL and gives immediate checkmark/screen-reader feedback, returning to its default state after a short interval. The visible “Copy” text must be absent while the stable accessible label “Copy public survey URL” remains.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The Public URL was rendered as static code text and there was no clipboard control or client feedback state.
- **Implementation summary:** The first implementation (`3cc031a053fbdcab8c1cf854ba158dc9573f2d83`) added a copy icon plus visible Copy/Copied text. The reopened correction removes visible text, retains the copy/check icon transition, stable accessible label, screen-reader success status, timer reset, full absolute URL copying, and visible failure fallback.
- **Tests / verification performed:** Updated clipboard coverage to assert the complete absolute URL, icon-only rendering, persistent accessible name, checkmark feedback, and screen-reader status. The complete 247-test suite and all local quality gates passed.
- **Production verification status:** Reopened on 2026-09-03 after the user confirmed the production control worked but requested removal of its visible Copy text. The icon-only correction is local only and awaits production deployment and manual verification.
- **Relevant commits:** First implementation `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`; reopened correction `d2340db15a8b71324679c7c4b4253615429ed029`.

## QA-008

- **ID:** QA-008
- **Date reported:** 2026-09-01
- **Area / screen:** Activated survey / Public URL
- **Original user-reported problem:** Right now production displays: “Public URL: /survey/v82db2I1Tfjzb7vovjFneg”. This is not useful to a user who wants to send/open the survey on another device. I currently cannot conveniently open this survey on my phone.
- **Expected behaviour / acceptance criteria:** Display a complete, clickable absolute public URL derived from the configured canonical application origin, with production using configured `APP_ORIGIN`. The URL works directly on another device and QA-007 copies the same full URL. Do not alter the underlying public survey token/id semantics.
- **Status:** Verified in production
- **Root cause:** The survey detail page constructed and rendered only the relative `/survey/<public-id>` path even though canonical `APP_ORIGIN` was already mandatory server configuration.
- **Implementation summary:** The server now builds the absolute URL from `APP_ORIGIN` plus the unchanged public token/path. The UI displays it as a responsive clickable link and passes the identical absolute value to the copy control.
- **Tests / verification performed:** Added a URL-construction test using a configured canonical origin plus UI link and clipboard tests for the full absolute URL. Configuration validation already enforces production `APP_ORIGIN`. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed; database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Verified in production. The complete production URL opened successfully on 2026-09-02, and on 2026-09-03 the user confirmed opening the production survey on a phone, completing it, and submitting a response.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-009

- **ID:** QA-009
- **Date reported:** 2026-09-02
- **Area / screen:** Internal Shell / sidebar navigation
- **Original user-reported problem:** When navigating between sections in the Internal Shell, Workspace remains visually selected even after I navigate elsewhere. Example: I click Surveys; the Surveys page opens; but Workspace still appears selected in the sidebar.
- **Expected behaviour / acceptance criteria:** Only the section corresponding to the current route appears active. Surveys is highlighted on Surveys routes, Workspace on the Workspace route, and the same behavior applies consistently to all sidebar sections. Direct navigation and page refresh on nested routes also produce the correct state. Active state is derived reliably from the current route rather than local click state.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** Workspace has a permanently hard-coded active background class, while every other link has a permanently inactive class. The shell does not inspect the current pathname at all.
- **Implementation summary:** Converted the shell navigation to derive active state from the current pathname. Workspace matches only `/app`; Surveys, Respondents, and Admin match their section root and nested routes. The active link receives both visual styling and `aria-current="page"`.
- **Tests / verification performed:** Added UI coverage for Workspace and a directly loaded nested Surveys route, including exclusive `aria-current` state. The complete non-database suite passed (46 files, 236 tests), along with typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan.
- **Production verification status:** Partially verified on 2026-09-02 at deployed commit `87a8d311bec08d33ec709d793184f0faecf3101f`: Workspace was active only on `/app`; Surveys was active and Workspace inactive after client navigation; direct refresh of nested `/app/surveys/new` retained the Surveys active state; nested `/app/admin/employees` retained the Admin active state. Respondents-route visual state was not checked before the authenticated session was revoked, so full manual production verification remains pending.
- **Relevant commit:** `4d3fd18e6d024e61c0d1564864dd5e2a432d6808`

## QA-010

- **ID:** QA-010
- **Date reported:** 2026-09-02
- **Area / screen:** Surveys / global lifecycle action
- **Original user-reported problem:** The global action currently called Pause all active surveys / Stop all active surveys is positioned incorrectly. Move this action into the Surveys section. It is a survey-management action, not a general Workspace/Admin dashboard action.
- **Expected behaviour / acceptance criteria:** The consistently labelled “Pause all active surveys” action appears in the Surveys section only for Admin users. Other roles do not see it. The backend independently rejects direct non-Admin calls. Terminology remains consistent with the PAUSED/PENDING lifecycle domain.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The bulk pause control is coupled to the Admin infrastructure component because it was originally delivered as an infrastructure-capacity control, even though its domain effect is survey lifecycle management. The service already requires Admin server-side, but the control is consequently absent from Surveys and misplaced in Admin.
- **Implementation summary:** Removed the bulk pause action from the Admin infrastructure controls and placed the consistently labelled “Pause all active surveys” action on the Surveys page through a role-gated survey-management component. The existing service authorization remains Admin-only and independently enforced server-side.
- **Tests / verification performed:** Added UI coverage proving the action renders for Admin and not Product Manager. Existing service tests prove Product Manager rejection. The complete non-database suite passed (46 files, 236 tests), along with typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan.
- **Production verification status:** Partially verified on 2026-09-02 at deployed commit `87a8d311bec08d33ec709d793184f0faecf3101f`: the consistently labelled Admin action appeared in Surveys and was absent from the Admin infrastructure screen. The user subsequently confirmed on 2026-09-03 that Pause all active surveys works in production. The newly discovered post-pause display/grouping defect is tracked separately as QA-017 and does not reopen QA-010.
- **Relevant commit:** `4d3fd18e6d024e61c0d1564864dd5e2a432d6808`

## QA-011

- **ID:** QA-011
- **Date reported:** 2026-09-02
- **Area / screen:** Admin / employee and invitation lifecycle
- **Original user-reported problem:** In the Admin panel I invited a person. A new row appeared containing the person's email and role. This row currently needs proper lifecycle management. Admin must be able to cancel an invitation that has not yet been accepted, change a team member's role (including safely correcting a pending invitation role), and deactivate a team member who should no longer have access.
- **Expected behaviour / acceptance criteria:** Admin can confirm and cancel an unaccepted invitation; cancellation is persisted and audited, immediately invalidates the emailed token, prevents later acceptance, and shows an appropriate cancelled/expired state. Admin can view and change roles using only existing valid roles for registered employees and, where safe within the model, pending invitations; changes persist, are audited, enforced server-side, and affect permissions immediately or on the next request/session refresh according to the existing authentication architecture. Admin can confirm and deactivate an employee without deleting historical identity/authorship/audit records; server-side access and already-authenticated sessions are revoked. UI clearly distinguishes active, pending invitation, cancelled invitation, and deactivated states.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** Safe backend lifecycle operations already exist for invitation disabling and employee role/disable/reenable: they transact, audit, revoke sessions, increment authorization versions, and preserve identity records. The UI exposes them with implementation-oriented “Disable” labels, no consequential confirmation, ambiguous statuses, and immediate role-select mutation. Pending invitations have no role-correction operation even though `assigned_role` is designed to remain mutable until acceptance and acceptance resolves the role from the locked server record.
- **Implementation summary:** Reframed unused-invitation disabling as confirmed “Cancel invitation”; the existing transaction immediately clears the token hash/expiry, persists cancellation metadata, and audits the action. Added pending-invitation role correction through a validated Admin-only endpoint and transactional audited repository update; acceptance continues to resolve the assigned role from the locked server record. Replaced accidental select-on-change role mutation with an explicit Change role action showing the current role. Reframed employee disabling as confirmed Deactivate and added distinct Active, Pending/Expired invitation, Cancelled invitation, and Deactivated UI labels. Registered role changes and deactivation continue to increment authorization version, revoke sessions, and preserve user/authorship/audit records.
- **Tests / verification performed:** Added service tests for Admin-only pending-role correction and UI tests for confirmation, explicit role submission, and lifecycle labels. Added database integration assertions that a corrected pending role is used at acceptance and audited; existing integration coverage verifies token invalidation, rejected acceptance, session revocation, authorization changes, deactivation, re-enable behavior, audits, and historical row preservation. The executable non-database suite passed (46 files, 236 tests), plus typecheck, lint, formatting, build, and security/artifact scans. Database tests could not execute because the host lacks the required `cockroach` binary.
- **Production verification status:** Partially verified on 2026-09-02 at deployed commit `87a8d311bec08d33ec709d793184f0faecf3101f`: the active Admin row showed its current role, constrained role selector, explicit Change role, Active status, and Deactivate action; a pending invitation showed its current role, constrained role selector, explicit Change role, Invited status, Resend invitation, and Cancel invitation. During an attempted non-mutating confirmation check, the browser did not expose a dialog handle and the subsequent request was redirected to sign-in, consistent with the current Admin having been deactivated and its existing session revoked. No further lifecycle mutations were attempted. The user later confirmed that the original lifecycle work is only partially complete and reported two distinct follow-ups: stale re-invitation timing (QA-018) and missing Admin-role confirmation (QA-019). Cancellation, role persistence, token invalidation, post-change authorization, and the follow-up fixes still require controlled manual production verification.
- **Relevant commit:** `4d3fd18e6d024e61c0d1564864dd5e2a432d6808`

## QA-012

- **ID:** QA-012
- **Date reported:** 2026-09-02
- **Area / screen:** Admin / Provider quota detail
- **Original user-reported problem:** The Admin panel contains the block titled “Provider quota detail,” with Provider / quota, Usage, Source, Period / reset, Updated, Console, and a Manual provider-dashboard reconciliation form. As a user, I currently do not understand what this block is for. Additionally, the controls/header items at the top appear non-functional or empty.
- **Expected behaviour / acceptance criteria:** The initial investigation must record the block's operational purpose and dependencies. Following the user's final product decision on 2026-09-03, remove the complete user-facing Manual provider-dashboard reconciliation block, including its controls, inputs, explanatory copy, action, empty container, and spacing. Do not replace or relocate it in product UI. Remove the now-unused HTTP/service/repository mutation path while preserving independent scheduled estimation, monitoring, alerts, capacity enforcement, deployment observation, quota detail, and historical snapshot compatibility.
- **Status:** Fixed — awaiting production verification
- **Root cause:** This block was intentionally designed by the Phase 12 infrastructure requirements as an Admin operational console: its top area is a table of effective readings for Netlify credits, CockroachDB request units and storage, and Brevo daily sends; its manual form records dated provider-dashboard actuals when supported APIs are unavailable. Those readings feed the cached usage headline, alerts, and capacity protection. It appears empty when no effective usage snapshots have been evaluated, with no empty-state explanation, and its form misleadingly offers a provider selector plus free-text quota key even though the server accepts only four fixed provider/quota combinations. It is operationally useful to an Admin responsible for free-tier safety—not merely release evidence—but its purpose and constrained inputs are not explained.
- **Implementation summary:** The first pass retained and clarified the operational block, constrained its inputs, and preserved all infrastructure safeguards while its product value was evaluated. After the user's final decision, the entire manual reconciliation form was removed without replacement or residual container. Its POST schema/handler and exclusive service/repository interface and implementation were also removed. The read-only provider quota table and independently invoked automated estimator, scheduled checks, threshold alerts, active-Admin alert recipients, deployment observation, Brevo delivery accounting, capacity enforcement, atomic survey switching, and bulk survey pause paths remain intact; existing historical snapshot source values remain readable.
- **Tests / verification performed:** Updated UI tests prove that the reconciliation heading, provider selector, save action, form, and empty container are absent while provider readings, alerts, provider links, automated empty state, and capacity selection remain. Existing estimator, scheduled-check, alert, deployment-observation, capacity, and audit coverage remains. The full local suite passed: 48 application test files / 258 tests and 8 database files / 56 tests in each of two deterministic fresh migration rehearsals, plus typecheck, lint, formatting, Prisma validation, production build, client-bundle scan, and production-artifact scan.
- **Production verification status:** The original explanatory iteration was partially verified on 2026-09-02 at deployed commit `87a8d311bec08d33ec709d793184f0faecf3101f`, after which the user decided the manual product UI was not needed. The removal is local only and awaits production deployment and verification; no provider quota or production configuration was mutated.
- **Relevant commits:** `4d3fd18e6d024e61c0d1564864dd5e2a432d6808`, `909a734fc9eb8e6b49d5efbc5326dfe07dc9093d`

## QA-013

- **ID:** QA-013
- **Date reported:** 2026-09-02
- **Area / screen:** Surveys / Pause all active surveys
- **Original user-reported problem:** The current global survey-stop action in the Admin panel does not work. This should be fixed together with QA-010 when the action is moved into the Surveys section.
- **Expected behaviour / acceptance criteria:** An Admin sees a confirmation explaining that respondents will stop being able to submit, with Cancel and Pause all actions. On confirmation, all and only ACTIVE surveys are atomically persisted as paused, the Surveys UI refreshes immediately, and a non-blocking “All active surveys have been paused.” toast disappears after about three seconds without another click. Failure shows an explicit error and never false success or false paused UI. Non-Admins are rejected server-side. Respondent operations/submission enforce the paused state on subsequent server requests even when a survey page was already open.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The repository bulk update is already transactional and updates all and only ACTIVE surveys, while the service independently requires Admin. The UI invokes it immediately without confirmation, reports only a generic infrastructure message, does not refresh the Surveys list, and is located outside Surveys. Existing respondent creation is blocked while a survey is PENDING, but the original attempt model deliberately allows an already identified current response to continue autosaving while capacity-paused; this conflicts with the newly requested manual-pause promise and requires server-side enforcement for manual pauses.
- **Implementation summary:** Added an inline confirmation step with Cancel/Pause all actions and the requested consequence text. Success refreshes the server-rendered Surveys list and shows an auto-expiring three-second success toast; failure shows an error toast without refresh or false success. The existing repository transaction atomically updates all and only ACTIVE surveys to `PENDING_CAPACITY` with `MANUAL` reason and audits the affected count. Existing/new respondent identification remains blocked while pending. For an already open response, server load now returns a manual-pause state and both answer mutations and submission reject manual pauses; automatic infrastructure-capacity pauses retain their existing recovery/autosave semantics.
- **Tests / verification performed:** Added UI tests proving no request before confirmation, success refresh/toast, and failure behavior; retained server authorization rejection coverage; expanded database integration assertions for all-and-only ACTIVE bulk transition and unaffected Draft/Pending/Completed surveys; updated public respondent integration coverage for manual-pause load, mutation, submission, and new-identification rejection. The complete non-database suite passed (46 files, 236 tests), along with typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan. Database integration execution remains unavailable because `cockroach` is not installed on this host.
- **Production verification status:** Partially verified on 2026-09-02 at deployed commit `87a8d311bec08d33ec709d793184f0faecf3101f`: the bulk action appeared on the Admin Surveys screen while one survey was ACTIVE, one was already PENDING_CAPACITY, and one was a Draft. The confirmation/bulk mutation was not executed because the authenticated Admin session was revoked during QA-011 verification. Atomic persistence, toast/refresh, unaffected states, and respondent blocking therefore remain awaiting controlled manual production verification; automated UI, authorization, repository, and respondent integration assertions cover these paths.
- **Relevant commit:** `4d3fd18e6d024e61c0d1564864dd5e2a432d6808`

## QA-014

- **ID:** QA-014
- **Date reported:** 2026-09-03
- **Area / screen:** Public respondent / successful completion
- **Original user-reported problem:** After successfully submitting a production response, the completion screen contains additional post-submission explanation that is not needed.
- **Expected behaviour / acceptance criteria:** Only “Thank you. Your response has been recorded.” is shown after the server confirms successful persistence. No actions, identifiers, metadata, navigation, technical details, debug information, or additional explanatory copy appear. A failed or incomplete submission must retain its error/validation state and must never show success.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The shared unavailable-state card rendered a separate title plus an additional edit-window explanation for the local submitted state.
- **Implementation summary:** Replaced the submitted-state card with a dedicated minimal completion section containing exactly the required sentence. Submission and persistence logic are unchanged, and the state is still entered only after an OK response explicitly reports `submitted: true`.
- **Tests / verification performed:** Added UI tests proving the exact minimal completion content after successful persistence, absence of the previous edit-window copy and submit action, and absence of success when the submission endpoint fails. The complete 247-test suite and all local quality gates passed.
- **Production verification status:** The user successfully completed and submitted a production survey on a phone, revealing this issue. The corrected completion state is local only and awaits production deployment and desktop/mobile manual verification.
- **Relevant commit:** `d2340db15a8b71324679c7c4b4253615429ed029`

## QA-015

- **ID:** QA-015
- **Date reported:** 2026-09-03
- **Area / screen:** Survey authoring / Title and Description
- **Original user-reported problem:** The authoring UI does not make clear that the survey title and description are visible to respondents on the public survey page.
- **Expected behaviour / acceptance criteria:** Empty fields use exactly “Survey title — visible to respondents” and “Survey description — visible to respondents” as visually muted placeholders. Each placeholder disappears during typing, reappears when emptied, never becomes form state or persisted survey content, and adds no permanent warning/helper UI. Actual public rendering remains unchanged.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The fields had labels but no contextual empty-state guidance connecting their content to the respondent experience.
- **Implementation summary:** Added the two requested native placeholders directly to the controlled title input and description textarea. Their values continue to come only from React editor state and the unchanged draft payload.
- **Tests / verification performed:** Added assertions for the exact placeholders, empty underlying values, and normal replacement by authored content. Existing save/activation payload tests confirm real state—not placeholder text—is submitted. The complete 247-test suite and all local quality gates passed.
- **Production verification status:** Local implementation awaits production deployment and manual authoring verification.
- **Relevant commit:** `d2340db15a8b71324679c7c4b4253615429ed029`

## QA-016

- **ID:** QA-016
- **Date reported:** 2026-09-03
- **Area / screen:** Public respondent / choice answers
- **Original user-reported problem:** Radio buttons and checkboxes sit slightly above their corresponding answer text.
- **Expected behaviour / acceptance criteria:** Single-choice radio controls and multiple-choice checkboxes align vertically with normal single-line labels and remain naturally aligned to the first line when labels wrap. Selection behaviour, semantics, validation, ordering, and control type remain unchanged. Verify desktop and mobile layouts.
- **Status:** Fixed — awaiting production verification
- **Root cause:** Choice labels used a flex row with no explicit cross-axis alignment or control offset, leaving native controls aligned inconsistently against the text line box.
- **Implementation summary:** Choice rows now use explicit top alignment, while each fixed-size radio/checkbox has a small top offset and cannot shrink. This centers it against a normal first text line and preserves natural first-line alignment for wrapped labels without changing input semantics or handlers.
- **Tests / verification performed:** Added radio and checkbox assertions for the alignment classes with single-line and wrapping-length labels at 375 px mobile and 1280 px desktop viewport widths. Existing respondent interaction tests remain intact. The complete 247-test suite, typecheck, lint, formatting, production build, Prisma validation, client-bundle scan, and production-artifact scan passed.
- **Production verification status:** Local implementation awaits production deployment and manual visual verification at desktop and mobile viewport sizes.
- **Relevant commit:** `d2340db15a8b71324679c7c4b4253615429ed029`

## QA-017

- **ID:** QA-017
- **Date reported:** 2026-09-03
- **Area / screen:** Surveys / lifecycle grouping
- **Original user-reported problem:** After Pause all active surveys succeeds, paused surveys remain displayed in “Active / Operational surveys.”
- **Expected behaviour / acceptance criteria:** Remove “Operational” terminology from this grouping. The Active section contains only ACTIVE surveys. A separate Paused section is hidden when empty and appears as soon as one or more `PENDING_CAPACITY` surveys exist; it contains every paused survey exactly once and displays the user-facing status “Paused.” Individual and bulk transitions regroup surveys correctly without changing backend pause semantics.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The Surveys page intentionally combined `ACTIVE` and `PENDING_CAPACITY` records in one “Active/Operational Surveys” array and rendered raw enum text, so a successful pause could not move a card to a distinct user-facing group.
- **Implementation summary:** Split survey rendering into mutually exclusive Draft, Active, Paused, and History filters. Active now accepts only `ACTIVE`; Paused accepts `PENDING_CAPACITY`, renders only when non-empty, and translates that backend state to the visible label “Paused.” The workspace shortcut also uses “Active Surveys.” Existing lifecycle mutations and pause semantics are unchanged.
- **Tests / verification performed:** Added UI coverage for the absent empty Paused section, Active-only membership, conditional Paused rendering, visible Paused status, transition/bulk-pause regrouping, and single rendering across the two sections. The full local suite passed: 48 test files / 250 tests, 8 database files / 56 tests in each of two deterministic fresh migration rehearsals, plus typecheck, lint, formatting, Prisma validation, production build, client-bundle scan, and production-artifact scan.
- **Production verification status:** Not deployed; local verification only. No production surveys were mutated.
- **Relevant commit:** `3cac4b67ef07c8bc7483fcc932c33cf161199400`

## QA-018

- **ID:** QA-018
- **Date reported:** 2026-09-03
- **Area / screen:** Admin / re-invitation lifecycle
- **Original user-reported problem:** Re-inviting a previously deactivated/cancelled employee entry generated a usable invitation but continued to display the original invitation time and expiration time.
- **Expected behaviour / acceptance criteria:** Every re-invitation event receives the new action time and a newly calculated expiry under the existing 72-hour rule. Its new token uses that window, while cancelled, consumed, expired, or superseded tokens remain invalid. The Admin UI displays the refreshed invitation and expiry times. Existing identity and history are retained without duplicate employee/invitation identities or physical deletion of audit history.
- **Status:** Fixed — awaiting production verification
- **Root cause:** Token rotation updated `token_hash`, `token_expires_at`, and `updated_at`, but the management list intentionally displayed `created_at` as the invitation time. Reactivating or resending the same invitation record therefore exposed the original event time even though the validity window had changed.
- **Implementation summary:** Reactivation and resend now atomically refresh the invitation record's displayed `created_at` alongside its new token hash, expiry, and update time. The existing row ID, registered-user link where applicable, audit trail, unique email constraints, and token invalidation behavior remain unchanged.
- **Tests / verification performed:** Expanded database integration coverage to advance the clock and prove fresh invitation/expiry timestamps, an exact new 72-hour validity window, a different token hash, old-token rejection, new-token validity, a single preserved invitation identity, and unchanged linked identity state. Both deterministic database rehearsals passed all 56 integration tests, and the full 250-test application suite and all local quality/security/artifact gates passed.
- **Production verification status:** Not deployed; local verification only. No production users, invitations, credentials, or database records were changed.
- **Relevant commit:** `3cac4b67ef07c8bc7483fcc932c33cf161199400`

## QA-019

- **ID:** QA-019
- **Date reported:** 2026-09-03
- **Area / screen:** Admin / employee role assignment
- **Original user-reported problem:** Selecting Admin in the normal role-change flow can grant high-impact Admin permissions without a dedicated confirmation.
- **Expected behaviour / acceptance criteria:** Selecting Admin does not persist anything. Activating Change role presents a separate explicit confirmation that clearly says the employee will receive Admin permissions. Cancellation leaves the existing role unchanged and sends no request; affirmative confirmation persists through the existing authorized role-change endpoint. Ordinary non-Admin changes do not gain a new confirmation. Separate last-active-Admin protection is out of scope.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The explicit Change role button prevented select-on-change persistence, but treated Admin and ordinary target roles identically when the button was activated.
- **Implementation summary:** Added an Admin-target-only confirmation at the actual submit boundary. A cancelled confirmation returns before the mutation call; an affirmative confirmation uses the unchanged server-authorized employee or pending-invitation role endpoint. Non-Admin role changes retain the existing one-step Change role behavior.
- **Tests / verification performed:** Added UI assertions that selection alone is non-mutating, cancellation makes no request, the confirmation explains Admin permissions, confirmation submits `ADMIN`, and ordinary role changes bypass this extra confirmation. Existing service tests continue to prove backend Admin-only authorization. The full 250-test application suite, database rehearsals, and all requested local quality/security/artifact gates passed.
- **Production verification status:** Deployed in production commit `982c258a0dc435a47bb1d30e181be8be515e29b0`. Subsequent manual review found the intermediate Change role button redundant and requested an immediate selection-driven flow with revised confirmation copy; that distinct refinement is tracked as QA-021.
- **Relevant commit:** `3cac4b67ef07c8bc7483fcc932c33cf161199400`

## QA-020

- **ID:** QA-020
- **Date reported:** 2026-09-03
- **Area / screen:** Public survey / respondent phone identification
- **Original user-reported problem:** The phone field accepted an overlong Russian number such as `+7968234123432`.
- **Expected behaviour / acceptance criteria:** A `+7` phone must preserve `+` and normalize to exactly 11 digits after it; `+79682341234` is valid, while incomplete and overlong forms are invalid and cannot be submitted or stored. Frontend and backend enforce the same rule, overlong pasted input is visibly rejected rather than silently truncated into validity, and keyboard entry beyond the valid `+7` digit maximum is prevented where practical. Existing international validation, canonical storage, HMAC lookup, and deduplication remain unchanged for valid non-`+7` numbers.
- **Status:** Fixed — awaiting production verification
- **Root cause:** The backend delegated to general international parsing and the client relied only on a broad 64-character input cap, with no shared explicit `+7` length rule or pre-submit feedback.
- **Implementation summary:** Added a shared canonical phone validator used by both the public client and server normalization. It retains libphonenumber validation for all supported countries and additionally requires canonical `+7` values to contain exactly 11 digits. The controlled phone input validates before fetch, retains pasted invalid text for visible correction, reports incomplete/invalid input, and prevents further single-digit keyboard entry once a `+7` value already contains 11 digits. Backend service validation remains authoritative before encryption, HMAC lookup, or persistence.
- **Tests / verification performed:** Added frontend tests for incomplete and overlong `+7`, the exact invalid and valid examples, preserved pasted overlong value, blocked submission, and valid UK input. Server tests independently reject short/overlong `+7` and accept valid Russian and UK numbers. Existing database integration continues to prove canonical same-phone lookup/deduplication and encrypted/HMAC-only storage. The full 258-test application suite, two 56-test fresh-database rehearsals, and all requested local gates passed.
- **Production verification status:** Not deployed; local verification only. No production phone or respondent record was used.
- **Relevant commit:** `909a734fc9eb8e6b49d5efbc5326dfe07dc9093d`

## QA-021

- **ID:** QA-021
- **Date reported:** 2026-09-03
- **Area / screen:** Admin / employee role assignment
- **Original user-reported problem:** The role-change flow unnecessarily requires selecting a role and then clicking Change role. The Admin confirmation also needs clearer prescribed copy and must reset the selector when cancelled.
- **Expected behaviour / acceptance criteria:** Remove the Change role button. Selecting a non-Admin role immediately invokes the existing authorized role-change flow. Selecting Admin immediately presents `Вы хотите назначить роль «Администратор». Вы уверены?`; confirmation persists Admin through the existing backend path, while cancellation sends no mutation and restores the dropdown to the employee's current role. Existing backend authorization and Admin-role safety logic remain unchanged.
- **Status:** Fixed — awaiting production verification
- **Root cause:** QA-019 added its Admin confirmation at the explicit Change role button boundary, retaining the older two-step selector-plus-button interaction. Cancelling that confirmation also left the locally controlled selector displaying Admin.
- **Implementation summary:** Removed Change role from the role editor and moved submission to the selector's change handler. Non-Admin selections call the unchanged mutation immediately. Admin selection invokes the exact requested confirmation first; cancellation resets local selector state to the current persisted role, and confirmation calls the same authorized backend mutation.
- **Tests / verification performed:** Updated UI coverage to prove the button is absent, non-Admin selection persists immediately without confirmation, Admin selection uses the exact confirmation copy, cancellation makes no request and restores the prior value, and confirmation submits Admin. Existing service authorization coverage remains unchanged. The full local application suite passed (48 files / 250 tests), along with typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan.
- **Production verification status:** Not deployed; local verification only. No production roles or users were changed.
- **Relevant commit:** `aa2ddff409bc1df1207dd17f38bc5141b9284179`

## QA-022

- **ID:** QA-022
- **Date reported:** 2026-09-03
- **Area / screen:** Admin / employee access invariant
- **Original user-reported problem:** Production previously allowed the only active Admin to be deactivated, leaving the workspace without an active administrator and requiring database-level recovery.
- **Expected behaviour / acceptance criteria:** The workspace always retains at least one active Admin. Any UI, API, or supported application attempt to deactivate or demote the last active Admin is rejected without partial mutation and with understandable feedback. With two or more active Admins, one may be deactivated or demoted. Concurrent removal attempts cannot leave zero active Admins. Existing Admin-assignment confirmation remains unchanged.
- **Status:** Fixed — awaiting production verification
- **Root cause:** Employee deactivation and role changes were individually transactional and authorized, but neither transaction enforced a cross-user minimum-active-Admin invariant. Two concurrent requests could therefore independently remove Admin access.
- **Implementation summary:** Both role change and deactivation now lock the complete active-Admin set in stable ID order inside the existing retrying serializable transaction before locking and mutating the target. If the active target is the sole Admin, the repository raises `LAST_ACTIVE_ADMIN_REQUIRED` with the operation-specific safe message before any user, invitation, session, authorization-version, or audit mutation. The UI derives the same state for immediate guidance, disables the sole Admin's role selector and Deactivate action, and explains how to proceed. Direct requests remain authoritatively protected in the repository. Admin assignment and its QA-021 confirmation are unchanged.
- **Tests / verification performed:** Added UI coverage for disabled sole-Admin removal controls and both explanations. Database integration covers sole-Admin deactivation and demotion rejection, unchanged role/status/authorization version after failure, allowed deactivation and demotion with two Admins, and simultaneous deactivation/demotion yielding one success and one rejection with exactly one active Admin remaining. Both deterministic fresh-database runs passed all 56 integration tests; the full 258-test application suite and all requested local quality/security/artifact gates passed.
- **Production verification status:** Not deployed; local and synthetic database verification only. No production Admin, user, invitation, role, or record was touched.
- **Relevant commit:** `909a734fc9eb8e6b49d5efbc5326dfe07dc9093d`
