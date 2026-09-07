# Quantitative Survey Platform

A finished quantitative research platform with an internal employee workspace and a public, account-free respondent experience. It supports survey design, response collection, respondent management and reproducible results reporting.

## Employee workspace

- Create and duplicate surveys with up to 50 Single Choice, Multiple Choice or Free Text questions; mark questions Required or Optional and reorder questions and options.
- Configure Single Choice branching to the next question, a later question or the end of the survey. Routes are validated server-side, and answers made unreachable by a response change are removed.
- Manage the survey lifecycle: Draft → Active → Paused → Active, or permanent completion into History. Activation freezes the questionnaire. Manual pauses block response writes; infrastructure pauses allow eligible existing attempts to continue.
- Calculate immutable **Results Snapshots** on demand, with a consistent data cutoff and retained snapshot history. Opening Results does not recalculate results.
- Download aggregate snapshot XLSX exports and landscape A4 PDF reports with question charts. Authorised Researcher and Admin users can also export current responses, archived attempts and respondent-level free-text XLSX files.
- Find respondents by survey and exact Reference ID. Product Managers see aggregate results; Researcher and Admin roles can access respondent records and authorised PII.

Survey owners and Admins control lifecycle changes and result calculation. Admins manage exact-email invitations, employee roles, disabling and re-enabling accounts, and bulk survey pauses. Invitations expire after 72 hours and are single-use. Administration enforces a maximum of 15 active employees and preserves at least one active Admin.

## Respondent experience

Respondents open a public survey link on desktop or mobile, enter their name and phone, and answer only the questions on their reachable route. Answers autosave with save/retry feedback; pending changes retry after temporary connectivity loss. Submit validates reached Required questions.

The same browser can resume and edit for 24 hours after the latest successfully saved answer change, while the survey permits edits. Before the first change, the window starts at attempt creation. Reopening or submitting does not extend it. On an active survey, a new device using the same phone starts a blank attempt and archives the previous one without revealing its answers.

## Security and privacy

Names, phones and answer payloads are encrypted before database persistence. A separate survey-scoped phone HMAC supports duplicate lookup. Server-side role checks gate PII decryption and exports; secure HttpOnly cookies identify respondent attempts. Sensitive actions and exports are audited, with rate limiting, origin/CSRF checks and private download caching controls.

Aggregate snapshots and PDF reports contain no respondent identity fields or respondent-to-answer links. Grouped free-text answers can still contain identifying text and remain confidential research content. Respondent data is not sent to Brevo, analytics SaaS, AI providers or session-replay services.

## Technology

Next.js, React and TypeScript; Prisma with CockroachDB; Better Auth for employee authentication; Brevo for employee transactional email; Netlify hosting; pdfmake for PDF reports; Vitest and Playwright for testing.

## Product specification

[PRD v1.1](docs/Quantitative_Survey_Platform_PRD_v1.1.docx) defines the current implemented product. [PRD v1.0](docs/Quantitative_Survey_Platform_PRD_v1.0.docx) is retained as a historical specification.

## Local development

Use Node.js 20.9 or newer and pnpm 11. Copy `.env.example` to `.env.local`, configure a separate development database and local-only secrets, then install dependencies with `pnpm install --frozen-lockfile` and start with `pnpm dev`. Apply the existing database migrations and bootstrap the first Admin with `pnpm auth:bootstrap` using local credentials before employee sign-in.

Local development uses the local-file mail transport for employee email. Keep credentials and generated mailbox files out of Git.
