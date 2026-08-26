import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  syntheticBytes,
  syntheticIds,
  syntheticNow,
} from "./synthetic-fixtures";

const { Client } = pg;
const expectedTables = [
  "answer_options",
  "audit_events",
  "auth_accounts",
  "auth_sessions",
  "employee_invitations",
  "infrastructure_alert_deliveries",
  "infrastructure_control_state",
  "infrastructure_deployments",
  "infrastructure_estimate_buckets",
  "infrastructure_usage_snapshots",
  "password_reset_tokens",
  "public_survey_sessions",
  "respondents",
  "response_attempts",
  "results_snapshots",
  "security_rate_limits",
  "surveys",
  "questions",
  "users",
].sort();

async function rejectsConstraint(operation: () => Promise<unknown>) {
  await expect(operation()).rejects.toMatchObject({ code: expect.any(String) });
}

describe("Phase 1 CockroachDB schema", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, email_normalized, display_name, role, authorization_version, updated_at)
       VALUES ($1, 'admin@synthetic.invalid', 'Synthetic Admin', 'ADMIN', 1, $3),
              ($2, 'researcher@synthetic.invalid', 'Synthetic Researcher', 'RESEARCHER', 1, $3)`,
      [syntheticIds.admin, syntheticIds.researcher, syntheticNow],
    );
    await client.query(
      `INSERT INTO surveys (id, public_id, owner_id, title, updated_at)
       VALUES ($1, 'synthetic-survey-a', $3, 'Synthetic Survey A', $4),
              ($2, 'synthetic-survey-b', $3, 'Synthetic Survey B', $4)`,
      [
        syntheticIds.surveyA,
        syntheticIds.surveyB,
        syntheticIds.admin,
        syntheticNow,
      ],
    );
    await client.query(
      `INSERT INTO questions (id, survey_id, position, type, prompt, updated_at)
       VALUES ($1, $3, 1, 'SINGLE_CHOICE', 'Synthetic question A', $5),
              ($2, $4, 1, 'SINGLE_CHOICE', 'Synthetic question B', $5)`,
      [
        syntheticIds.questionA,
        syntheticIds.questionB,
        syntheticIds.surveyA,
        syntheticIds.surveyB,
        syntheticNow,
      ],
    );
    await client.query(
      `INSERT INTO respondents (
         id, survey_id, reference_id, name_ciphertext, name_nonce, name_key_version,
         phone_ciphertext, phone_nonce, phone_key_version, phone_lookup_hash,
         phone_lookup_key_version, identified_at, last_activity_at, updated_at
       ) VALUES
         ($1, $3, 'R-7K3M9W2X8Q4D', $5, $6, 1, $7, $6, 1, $8, 1, $9, $9, $9),
         ($2, $4, 'R-8K3M9W2X8Q4D', $5, $6, 1, $7, $6, 1, $8, 1, $9, $9, $9)`,
      [
        syntheticIds.respondentA,
        syntheticIds.respondentB,
        syntheticIds.surveyA,
        syntheticIds.surveyB,
        syntheticBytes.nameCiphertext,
        syntheticBytes.nonce,
        syntheticBytes.phoneCiphertext,
        syntheticBytes.phoneHash,
        syntheticNow,
      ],
    );
    await client.query(
      `INSERT INTO public_survey_sessions (
         id, survey_id, respondent_id, open_token_hash, created_while_status,
         first_opened_at, last_seen_at
       ) VALUES ($1, $3, $5, $7, 'ACTIVE', $9, $9),
                ($2, $4, $6, $8, 'ACTIVE', $9, $9)`,
      [
        syntheticIds.sessionA,
        syntheticIds.sessionB,
        syntheticIds.surveyA,
        syntheticIds.surveyB,
        syntheticIds.respondentA,
        syntheticIds.respondentB,
        syntheticBytes.tokenHashA,
        syntheticBytes.tokenHashB,
        syntheticNow,
      ],
    );
    await client.query(
      `INSERT INTO response_attempts (
         id, survey_id, respondent_id, public_survey_session_id, generation,
         attempt_number, attempt_token_hash, payload_ciphertext, payload_nonce,
         payload_key_version, payload_schema_version, coverage_basis_count,
         created_at, last_activity_at
       ) VALUES ($1, $2, $3, $4, 1, 1, $5, $6, $7, 1, 1, 1, $8, $8)`,
      [
        syntheticIds.attemptA,
        syntheticIds.surveyA,
        syntheticIds.respondentA,
        syntheticIds.sessionA,
        Buffer.alloc(32, 31),
        syntheticBytes.payloadCiphertext,
        syntheticBytes.nonce,
        syntheticNow,
      ],
    );
  });

  afterAll(async () => client.end());

  it("migrates an empty database to all expected objects", async () => {
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name).sort()).toEqual(
      expectedTables,
    );
  });

  it("defines exact enum values", async () => {
    const result = await client.query(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
       ORDER BY t.typname, e.enumsortorder`,
    );
    const enums = new Map<string, string[]>();
    for (const row of result.rows) {
      enums.set(row.typname, [
        ...(enums.get(row.typname) ?? []),
        row.enumlabel,
      ]);
    }
    expect(enums.get("EmployeeRole")).toEqual([
      "PRODUCT_MANAGER",
      "RESEARCHER",
      "ADMIN",
    ]);
    expect(enums.get("SurveyStatus")).toEqual([
      "DRAFT",
      "ACTIVE",
      "PENDING_CAPACITY",
      "COMPLETED",
    ]);
    expect(enums.get("ResponseAttemptStatus")).toEqual(["CURRENT", "ARCHIVED"]);
  });

  it("enforces the EmployeeInvitation lifecycle", async () => {
    await rejectsConstraint(() =>
      client.query(
        `INSERT INTO employee_invitations (
           id, email_normalized, assigned_role, status, invited_by_id,
           registered_at, updated_at
         ) VALUES (gen_random_uuid(), 'invalid-invitation@synthetic.invalid',
           'RESEARCHER', 'PENDING', $1, $2, $2)`,
        [syntheticIds.admin, syntheticNow],
      ),
    );
  });

  it("uses UUID primary keys for entity tables", async () => {
    const result = await client.query(
      `SELECT tc.table_name, kcu.column_name, c.data_type
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu USING (constraint_catalog, constraint_schema, constraint_name)
       JOIN information_schema.columns c ON c.table_schema = tc.table_schema AND c.table_name = tc.table_name AND c.column_name = kcu.column_name
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_name NOT IN ('_prisma_migrations', 'infrastructure_control_state')`,
    );
    expect(result.rows).not.toHaveLength(0);
    expect(
      result.rows.every(
        (row) =>
          row.column_name === "id" &&
          String(row.data_type).toLowerCase() === "uuid",
      ),
    ).toBe(true);
  });

  it("keeps every foreign key restrictive", async () => {
    const result = await client.query(
      "SELECT delete_rule, update_rule FROM information_schema.referential_constraints WHERE constraint_schema = 'public'",
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(
      result.rows.every((row) =>
        ["RESTRICT", "NO ACTION"].includes(row.delete_rule),
      ),
    ).toBe(true);
    expect(
      result.rows.every((row) =>
        ["RESTRICT", "NO ACTION"].includes(row.update_rule),
      ),
    ).toBe(true);
  });

  it("installs check, unique, partial unique, and supporting indexes", async () => {
    const checks = await client.query(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_type = 'CHECK'",
    );
    expect(checks.rows.length).toBeGreaterThanOrEqual(15);
    const respondentIndexes = await client.query(
      "SHOW INDEXES FROM respondents",
    );
    const attemptIndexes = await client.query(
      "SHOW INDEXES FROM response_attempts",
    );
    expect(
      respondentIndexes.rows.some(
        (row) =>
          row.index_name ===
            "respondents_survey_phone_lookup_hash_current_key" &&
          row.non_unique === false,
      ),
    ).toBe(true);
    expect(
      attemptIndexes.rows.some(
        (row) =>
          row.index_name ===
            "response_attempts_one_current_per_respondent_key" &&
          row.non_unique === false,
      ),
    ).toBe(true);
  });

  it("rejects an AnswerOption linked across surveys", async () => {
    await rejectsConstraint(() =>
      client.query(
        "INSERT INTO answer_options (id, question_id, survey_id, position, label, updated_at) VALUES (gen_random_uuid(), $1, $2, 1, 'Invalid', $3)",
        [syntheticIds.questionA, syntheticIds.surveyB, syntheticNow],
      ),
    );
  });

  it("rejects a PublicSurveySession linked to another survey's Respondent", async () => {
    await rejectsConstraint(() =>
      client.query(
        "UPDATE public_survey_sessions SET respondent_id = $1 WHERE id = $2",
        [syntheticIds.respondentB, syntheticIds.sessionA],
      ),
    );
  });

  it("rejects a ResponseAttempt with cross-survey Respondent or session links", async () => {
    await rejectsConstraint(() =>
      client.query(
        `INSERT INTO response_attempts (
           id, survey_id, respondent_id, public_survey_session_id, generation,
           attempt_number, payload_ciphertext, payload_nonce, payload_key_version,
           payload_schema_version, coverage_basis_count, created_at, last_activity_at
         ) VALUES (gen_random_uuid(), $1, $2, $3, 1, 2, $4, $5, 1, 1, 1, $6, $6)`,
        [
          syntheticIds.surveyA,
          syntheticIds.respondentB,
          syntheticIds.sessionA,
          syntheticBytes.payloadCiphertext,
          syntheticBytes.nonce,
          syntheticNow,
        ],
      ),
    );
  });

  it("rejects two CURRENT attempts for one Respondent", async () => {
    await rejectsConstraint(() =>
      client.query(
        `INSERT INTO response_attempts (
           id, survey_id, respondent_id, public_survey_session_id, generation,
           attempt_number, payload_ciphertext, payload_nonce, payload_key_version,
           payload_schema_version, coverage_basis_count, created_at, last_activity_at
         ) VALUES (gen_random_uuid(), $1, $2, $3, 2, 2, $4, $5, 1, 1, 1, $6, $6)`,
        [
          syntheticIds.surveyA,
          syntheticIds.respondentA,
          syntheticIds.sessionA,
          syntheticBytes.payloadCiphertext,
          syntheticBytes.nonce,
          syntheticNow,
        ],
      ),
    );
  });

  it("requires archival timestamps and reasons for ARCHIVED attempts", async () => {
    await rejectsConstraint(() =>
      client.query(
        "UPDATE response_attempts SET status = 'ARCHIVED' WHERE id = $1",
        [syntheticIds.attemptA],
      ),
    );
  });

  it("rejects duplicate globally unique reference IDs", async () => {
    await rejectsConstraint(() =>
      client.query(
        `INSERT INTO respondents (
           id, survey_id, reference_id, name_ciphertext, name_nonce, name_key_version,
           phone_ciphertext, phone_nonce, phone_key_version, phone_lookup_hash,
           phone_lookup_key_version, identified_at, last_activity_at, updated_at
         ) VALUES (gen_random_uuid(), $1, 'R-7K3M9W2X8Q4D', $2, $3, 1, $4, $3, 1, $5, 1, $6, $6, $6)`,
        [
          syntheticIds.surveyB,
          syntheticBytes.nameCiphertext,
          syntheticBytes.nonce,
          syntheticBytes.phoneCiphertext,
          Buffer.alloc(32, 90),
          syntheticNow,
        ],
      ),
    );
  });

  it("rejects duplicate phone hashes within one survey", async () => {
    await rejectsConstraint(() =>
      client.query(
        `INSERT INTO respondents (
           id, survey_id, reference_id, name_ciphertext, name_nonce, name_key_version,
           phone_ciphertext, phone_nonce, phone_key_version, phone_lookup_hash,
           phone_lookup_key_version, identified_at, last_activity_at, updated_at
         ) VALUES (gen_random_uuid(), $1, 'R-9K3M9W2X8Q4D', $2, $3, 1, $4, $3, 1, $5, 1, $6, $6, $6)`,
        [
          syntheticIds.surveyA,
          syntheticBytes.nameCiphertext,
          syntheticBytes.nonce,
          syntheticBytes.phoneCiphertext,
          syntheticBytes.phoneHash,
          syntheticNow,
        ],
      ),
    );
  });

  it("allows the same phone hash in different surveys", async () => {
    const result = await client.query(
      "SELECT count(*)::INT AS count FROM respondents WHERE phone_lookup_hash = $1",
      [syntheticBytes.phoneHash],
    );
    expect(Number(result.rows[0].count)).toBe(2);
  });

  it.each([0, 51])("rejects question position %s", async (position) => {
    await rejectsConstraint(() =>
      client.query(
        "INSERT INTO questions (id, survey_id, position, type, prompt, updated_at) VALUES (gen_random_uuid(), $1, $2, 'FREE_TEXT', 'Invalid', $3)",
        [syntheticIds.surveyA, position, syntheticNow],
      ),
    );
  });

  it.each([0, 12])("rejects answer-option position %s", async (position) => {
    await rejectsConstraint(() =>
      client.query(
        "INSERT INTO answer_options (id, question_id, survey_id, position, label, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, 'Invalid', $4)",
        [syntheticIds.questionA, syntheticIds.surveyA, position, syntheticNow],
      ),
    );
  });

  it("contains no plaintext respondent name or phone columns", async () => {
    const result = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'respondents' ORDER BY column_name",
    );
    const columns = result.rows.map((row) => row.column_name);
    expect(columns).not.toContain("name");
    expect(columns).not.toContain("phone");
    expect(columns).toEqual(
      expect.arrayContaining([
        "name_ciphertext",
        "phone_ciphertext",
        "phone_lookup_hash",
      ]),
    );
  });

  it("keeps ResultsSnapshot aggregate-only with encrypted free-text storage", async () => {
    const result = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'results_snapshots'",
    );
    const columns = result.rows.map((row) => row.column_name);
    expect(columns).not.toEqual(
      expect.arrayContaining([
        "respondent_id",
        "response_attempt_id",
        "name",
        "phone",
        "free_text",
      ]),
    );
    expect(columns).toEqual(
      expect.arrayContaining([
        "aggregate_results",
        "free_text_ciphertext",
        "free_text_nonce",
        "free_text_key_version",
      ]),
    );
  });

  it("does not create per-answer or unapproved persistence tables", async () => {
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = result.rows.map((row) => row.table_name);
    expect(names).not.toEqual(
      expect.arrayContaining([
        "answers",
        "answer_selections",
        "jobs",
        "queues",
        "files",
        "browser_session_events",
        "cache",
      ]),
    );
  });

  it("tombstones surveys without allowing destructive history deletion", async () => {
    await client.query(
      "UPDATE surveys SET tombstoned_at = $1, tombstoned_by_id = $2 WHERE id = $3",
      [syntheticNow, syntheticIds.admin, syntheticIds.surveyA],
    );
    await rejectsConstraint(() =>
      client.query("DELETE FROM surveys WHERE id = $1", [syntheticIds.surveyA]),
    );
    await rejectsConstraint(() =>
      client.query("DELETE FROM respondents WHERE id = $1", [
        syntheticIds.respondentA,
      ]),
    );
    const result = await client.query(
      "SELECT tombstoned_at FROM surveys WHERE id = $1",
      [syntheticIds.surveyA],
    );
    expect(result.rows[0].tombstoned_at).toBeTruthy();
  });

  it("documents deferred runtime snapshot grants without creating production accounts", async () => {
    const privileges = await readFile(
      resolve("docs/DATABASE_PRIVILEGES.md"),
      "utf8",
    );
    expect(privileges).toContain(
      "Must not update or delete `results_snapshots`",
    );
    expect(privileges).toContain("deferred until real environment identities");
    const sqlFiles = await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        readFile(
          resolve(
            "prisma/migrations",
            `20260826000${index + 1}_${
              [
                "core_user_auth",
                "employee_invitation",
                "survey_audit",
                "questions_options",
                "public_session_respondent",
                "response_attempt",
                "results_snapshot",
                "infrastructure_rate_limits",
                "constraint_index_hardening",
              ][index]
            }`,
            "migration.sql",
          ),
          "utf8",
        ),
      ),
    );
    expect(sqlFiles.join("\n")).not.toMatch(
      /CREATE\s+(USER|ROLE)|PASSWORD\s+/i,
    );
  });
});
