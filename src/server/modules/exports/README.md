# Exports module

Phase 11 generates bounded XLSX attachments directly from authenticated requests.
Aggregate snapshot exports are available to every employee role. Respondent-level
Current Raw, Archived Attempts, and Free Text exports require Researcher/Admin
PII authorization before queries or decryption and create safe audit records.

No export is persisted. Stable respondent/attempt ordering creates deterministic
parts when predicted response bytes or execution time exceed the synchronous
guard. Respondent-controlled cells are text-only and formula-neutralized.
