# Manual Production QA Tracker

This file is the persistent source of truth for issues found during manual production testing. New issues receive sequential IDs. A regression reopens the existing issue. Implementation or deployment alone does not qualify as production verification; an issue is marked **Verified in production** only after its acceptance criteria have been checked against the deployed production version.

Allowed statuses: **Reported**, **In Progress**, **Fixed — awaiting production verification**, **Fixed — awaiting manual production verification**, **Verified in production**, **Not fixed**, **Won't fix**.

## QA-001

- **ID:** QA-001
- **Date reported:** 2026-09-01
- **Area / screen:** Internal Shell / authenticated entry
- **Original user-reported problem:** Immediately upon entering Internal Shell, before I have done anything, I see: “Your session is missing or expired. Sign in to continue.” This is confusing because there has been no visible session expiry or preceding user action.
- **Expected behaviour / acceptance criteria:** A valid authenticated user must not see a stale or misleading session-expired message on normal entry. If authentication is genuinely missing, route through the correct sign-in/authentication flow instead of rendering an unexplained shell error. Eliminate any incorrect transient state caused by an initial unauthenticated request, hydration/race condition, stale client state, or similar implementation detail. Preserve fail-closed authentication and existing security boundaries.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The internal layout redirected every failed session lookup to `reason=session-required`, including a normal first visit with no session cookie. The public home page links directly to `/app`, and the sign-in page rendered that undifferentiated reason as “missing or expired.” This was deterministic server routing, not a client hydration race; valid sessions remain validated server-side and enter the shell.
- **Implementation summary:** Missing or invalid authentication still fails closed and routes to sign-in, but the ordinary authentication redirect no longer supplies or renders a misleading expiry notice. The password-reset success notice remains intact.
- **Tests / verification performed:** Added sign-in notice coverage for normal authentication routing and password-reset success. Existing auth service, plugin, policy, cookie, CSRF, and boundary tests passed in the 226-test unit/architecture suite. Typecheck, lint, formatting, production build, client-bundle scan, and production-artifact scan passed. Database rehearsal was not run because the host lacks the required `cockroach` executable.
- **Production verification status:** Partially checked in production on 2026-09-02 at deployed commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`: an unauthenticated `/app` request routes to `/sign-in` without the stale “missing or expired” notice. A valid authenticated entry could not be checked because no authenticated production session or user-visible controllable browser was available; manual verification remains required.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-002

- **ID:** QA-002
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / question controls
- **Original user-reported problem:** In survey creation, Add option is currently positioned incorrectly.
- **Expected behaviour / acceptance criteria:** Move Add option into the same question action row as Move up / Move down / Remove question. It is visually grouped with those question-level controls, green, and maintains clean spacing and responsive behaviour.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The Add option control was rendered in the answer-options heading, separately from the question action row.
- **Implementation summary:** Moved Add option into the responsive question action row and styled it as a green action without changing option limits or question semantics.
- **Tests / verification performed:** Added UI assertions for grouping, green styling, and existing option-limit behavior. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; authenticated survey-editor layout verification remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-003

- **ID:** QA-003
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / questionnaire editor
- **Original user-reported problem:** Add question is currently at the top of the form. This becomes unusable when editing a long survey because the user has to scroll back to the top to add question 10, 15, etc.
- **Expected behaviour / acceptance criteria:** Move Add question to the bottom of the questionnaire editor, immediately above the Save Draft / activation action area, and keep it easy to reach after editing the last question.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** Add question was part of the questionnaire heading row before the mapped question list.
- **Implementation summary:** Moved Add question after the questionnaire list and immediately before the final Save Draft / Activate action area.
- **Tests / verification performed:** Added a DOM-order assertion proving Add question precedes the final action group after the question list. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; authenticated long-survey editor verification remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-004

- **ID:** QA-004
- **Date reported:** 2026-09-01
- **Area / screen:** Survey creation / answer options
- **Original user-reported problem:** Questions can currently be reordered with Move up / Move down, but answer options cannot be reordered.
- **Expected behaviour / acceptance criteria:** Add drag-and-drop reordering for answer options. Options can be reordered only within their own question and cannot be dragged into another question. The resulting order persists in the draft. Provide an obvious drag handle and preserve keyboard/accessibility behaviour with an accessible alternative where required. Do not change question reordering unless technically necessary.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The builder stored options as an ordered array and the repository already persisted array order by position, but the UI exposed no option-reordering interaction.
- **Implementation summary:** Added a visible per-option drag handle with question-scoped drag data and drop validation. Cross-question drops are ignored. Added Move option up/down controls as the keyboard-accessible alternative. Reordering updates the existing ordered option array, which is saved through the unchanged draft API and repository position semantics.
- **Tests / verification performed:** Added tests for accessible up/down ordering, drag affordance, rejected cross-question drops, and the exact reordered option array submitted for draft persistence. Existing service and database ordering tests remain unchanged. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed; database rehearsal could not start because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; drag, keyboard fallback, cross-question rejection, and saved-order behavior passed automated tests, but authenticated production interaction remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-005

- **ID:** QA-005
- **Date reported:** 2026-09-01
- **Area / screen:** Survey editor / Duplicate Draft
- **Original user-reported problem:** Currently, clicking Duplicate Draft appears to do nothing. After a delay, the title simply changes to: “[original title] (Copy)”. This creates the impression that the button is broken.
- **Expected behaviour / acceptance criteria:** Immediately disable duplicate/repeated submission and show a clear loading state, overlay, or transition for the actual operation duration without artificial delay. On success show the duplicated draft normally; on failure show a visible error.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The duplicate request used a shared internal busy flag only to disable controls; the duplicate button text and page content gave no operation-specific pending feedback while the request was in flight.
- **Implementation summary:** Duplicate now synchronously locks repeated submission, changes its button label, and displays an accessible content-blocking “Duplicating survey…” overlay for the real request duration. Failures remain visibly rendered and success navigates to the copied draft without artificial delay.
- **Tests / verification performed:** Added a deferred-request UI test proving immediate pending feedback, disabled repeat submission, one network request, and navigation on success. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; duplicate loading, submission locking, success navigation, and error behavior passed automated tests, but authenticated production interaction remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-006

- **ID:** QA-006
- **Date reported:** 2026-09-01
- **Area / screen:** Survey editor / final actions
- **Original user-reported problem:** Activate is currently at the top of the page.
- **Expected behaviour / acceptance criteria:** Move Activate into the final action row at the bottom of the survey editor with Save Draft as a grey/secondary action and Activate as a green/primary action. Preserve all activation validation and lifecycle rules.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** Activate was owned and rendered by the page-level SurveyActions header while Save Draft was rendered independently at the end of SurveyBuilder.
- **Implementation summary:** Added a dedicated footer placement for the unchanged activation transition and composed it beside Save Draft in a labelled final action group. Save Draft is grey/secondary and Activate is green/primary. Non-draft lifecycle controls remain in their existing page-level location.
- **Tests / verification performed:** Added assertions that draft Activate is absent from header actions, present in the footer placement, green, and grouped with the grey Save Draft control. Existing activation validation, authorization, lifecycle, and security tests passed as part of the 226-test suite. Typecheck, lint, formatting, production build, and artifact scans passed; database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; authenticated survey-editor action positioning and activation behavior remain manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-007

- **ID:** QA-007
- **Date reported:** 2026-09-01
- **Area / screen:** Activated survey / Public URL
- **Original user-reported problem:** After survey activation, the Public URL is displayed. Add a copy-to-clipboard icon/button directly beside the URL.
- **Expected behaviour / acceptance criteria:** Clicking the adjacent control copies the complete usable URL and gives immediate feedback such as “Copied” or a checkmark, returning to its default state after a short interval. The button has an accessible label such as “Copy public survey URL.”
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The Public URL was rendered as static code text and there was no clipboard control or client feedback state.
- **Implementation summary:** Added an adjacent accessible “Copy public survey URL” control that copies the displayed URL, changes to a checkmark/Copied state immediately, resets after two seconds, and displays a visible fallback error if clipboard access fails.
- **Tests / verification performed:** Added clipboard assertions for the complete URL and Copied feedback. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed. Database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Deployed in production at commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`; clipboard behavior passed automated browser-component tests, but the authenticated production survey-detail control remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`

## QA-008

- **ID:** QA-008
- **Date reported:** 2026-09-01
- **Area / screen:** Activated survey / Public URL
- **Original user-reported problem:** Right now production displays: “Public URL: /survey/v82db2I1Tfjzb7vovjFneg”. This is not useful to a user who wants to send/open the survey on another device. I currently cannot conveniently open this survey on my phone.
- **Expected behaviour / acceptance criteria:** Display a complete, clickable absolute public URL derived from the configured canonical application origin, with production using configured `APP_ORIGIN`. The URL works directly on another device and QA-007 copies the same full URL. Do not alter the underlying public survey token/id semantics.
- **Status:** Fixed — awaiting manual production verification
- **Root cause:** The survey detail page constructed and rendered only the relative `/survey/<public-id>` path even though canonical `APP_ORIGIN` was already mandatory server configuration.
- **Implementation summary:** The server now builds the absolute URL from `APP_ORIGIN` plus the unchanged public token/path. The UI displays it as a responsive clickable link and passes the identical absolute value to the copy control.
- **Tests / verification performed:** Added a URL-construction test using a configured canonical origin plus UI link and clipboard tests for the full absolute URL. Configuration validation already enforces production `APP_ORIGIN`. The 226-test unit/architecture suite, typecheck, lint, formatting, production build, and artifact scans passed; database rehearsal was unavailable because `cockroach` is not installed.
- **Production verification status:** Partially checked in production on 2026-09-02 at deployed commit `a5444208bad53f88d57368a3af1bc8a3d88becb7`: the complete reported URL `https://quantitative-survey-platform.netlify.app/survey/v82db2I1Tfjzb7vovjFneg` opens directly and resolves to the real “Test Survey” public screen without console errors. Display of the absolute clickable URL inside the authenticated survey-detail page remains manual because no authenticated production session was available.
- **Relevant commit:** `3cc031a053fbdcab8c1cf854ba158dc9573f2d83`
