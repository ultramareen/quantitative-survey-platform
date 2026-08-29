import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import { PublicAttemptService } from "@/server/modules/attempts/service";
import { PgRespondentRepository } from "@/server/modules/respondents/repository";
import { PublicRespondentService } from "@/server/modules/respondents/service";
import { PgInternalRespondentRepository } from "@/server/modules/respondents/internal-repository";
import { InternalRespondentService } from "@/server/modules/respondents/internal-service";
import { ResultsService } from "@/server/modules/results/service";
import { PgSurveyRepository } from "@/server/modules/surveys/repository";
import { SurveyService } from "@/server/modules/surveys/service";
import type { EmployeePrincipal } from "@/types/employee";

const { Pool } = pg;
const ownerId = "60000000-0000-4000-8000-000000000001";
const adminId = "60000000-0000-4000-8000-000000000002";
const owner: EmployeePrincipal = {
  id: ownerId,
  email: "phase6-owner@synthetic.invalid",
  displayName: "Phase 6 Owner",
  role: "PRODUCT_MANAGER",
  authorizationVersion: 1,
};
const admin: EmployeePrincipal = {
  ...owner,
  id: adminId,
  email: "phase6-admin@synthetic.invalid",
  displayName: "Phase 6 Admin",
  role: "ADMIN",
};
const crypto = {
  piiEncryptionKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 41)]]),
  ),
  phoneLookupKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 42)]]),
  ),
  rateLimitHmacKey: Buffer.alloc(32, 43),
};

describe("Phase 6 public opens and encrypted respondent identity", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const surveys = new SurveyService(new PgSurveyRepository(pool));
  const respondents = new PublicRespondentService(
    new PgRespondentRepository(pool),
    crypto,
    () => new Date(),
  );
  const internalRespondents = new InternalRespondentService(
    new PgInternalRespondentRepository(pool),
    crypto,
  );
  const attempts = new PublicAttemptService(pool, crypto);
  const resultsService = new ResultsService(pool, crypto);
  let surveyId: string;
  let publicId: string;
  let openToken: string;
  let attemptToken: string;
  let replacementToken: string;
  let referenceId: string;
  beforeAll(async () => {
    const now = new Date();
    await pool.query(
      `INSERT INTO users (id,email_normalized,display_name,email_verified,role,authorization_version,created_at,updated_at) VALUES ($1,'phase6-owner@synthetic.invalid','Phase 6 Owner',true,'PRODUCT_MANAGER',1,$3,$3),($2,'phase6-admin@synthetic.invalid','Phase 6 Admin',true,'ADMIN',1,$3,$3)`,
      [ownerId, adminId, now],
    );
    surveyId = (
      await surveys.create(owner, {
        title: "Public Phase 6",
        description: "Identity foundation",
        questions: [
          {
            prompt: "Pick one",
            type: "SINGLE_CHOICE",
            required: true,
            options: ["Alpha", "Beta"],
          },
          {
            prompt: "Pick many",
            type: "MULTIPLE_CHOICE",
            required: false,
            options: ["Red", "Blue"],
          },
          {
            prompt: "Comment",
            type: "FREE_TEXT",
            required: false,
            options: [],
          },
        ],
      })
    ).id;
    const survey = await surveys.view(owner, surveyId);
    publicId = survey.publicId;
    await surveys.transition(owner, surveyId, "ACTIVE", survey.stateVersion);
  });
  afterAll(async () => pool.end());
  it("creates one PII-free Open and reuses it without creating a Respondent", async () => {
    const first = await respondents.open(publicId, undefined, "phase6-open-a");
    openToken = first.newOpenToken!;
    expect(first).toMatchObject({
      availability: "ACTIVE",
      identified: false,
      title: "Public Phase 6",
    });
    const second = await respondents.open(publicId, openToken, "phase6-open-a");
    expect(second.newOpenToken).toBeUndefined();
    await Promise.all([
      respondents.open(publicId, openToken, "phase6-open-a"),
      respondents.open(publicId, openToken, "phase6-open-a"),
    ]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM public_survey_sessions WHERE survey_id=$1",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM respondents WHERE survey_id=$1",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("creates encrypted identity and one blank CURRENT attempt", async () => {
    const result = await respondents.identify(
      publicId,
      openToken,
      { name: "Synthetic Respondent", phone: "202-555-0123", country: "US" },
      "phase6-identify-a",
    );
    expect(result.newAttemptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    attemptToken = result.newAttemptToken!;
    const row = (
      await pool.query(
        `SELECT r.id,r.reference_id,r.name_ciphertext,r.phone_ciphertext,r.phone_lookup_hash,p.respondent_id,a.status,a.attempt_token_hash,a.coverage_basis_count FROM respondents r JOIN public_survey_sessions p ON p.respondent_id=r.id JOIN response_attempts a ON a.respondent_id=r.id WHERE r.survey_id=$1`,
        [surveyId],
      )
    ).rows[0];
    expect(row.reference_id).toMatch(/^R-/);
    referenceId = row.reference_id;
    expect(row.respondent_id).toBe(row.id);
    expect(row.status).toBe("CURRENT");
    expect(row.coverage_basis_count).toBe(3);
    expect(row.attempt_token_hash).toHaveLength(32);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Synthetic Respondent");
    expect(serialized).not.toContain("+12025550123");
    expect(row.phone_lookup_hash).toHaveLength(32);
  });
  it("allows cross-owner Admin PII search, audits safely, and denies Product Manager access", async () => {
    const result = await internalRespondents.list(admin, {
      referenceId: referenceId.toLowerCase(),
    });
    expect(result.respondents).toHaveLength(1);
    expect(result.respondents[0]).toMatchObject({
      referenceId,
      name: "Synthetic Respondent",
      phone: "+12025550123",
      survey: { id: surveyId },
      coverage: { answeredQuestions: 0, totalQuestions: 3 },
      state: "EDITABLE",
    });
    await expect(
      internalRespondents.detail(owner, referenceId),
    ).rejects.toMatchObject({ status: 403 });
    const audit = (
      await pool.query<{ safe_metadata: unknown; affected_rows: number }>(
        "SELECT safe_metadata,affected_rows FROM audit_events WHERE actor_user_id=$1 AND action='RESPONDENT_PII_SEARCHED' ORDER BY created_at DESC LIMIT 1",
        [admin.id],
      )
    ).rows[0];
    expect(audit.affected_rows).toBe(1);
    expect(JSON.stringify(audit.safe_metadata)).not.toContain(
      "Synthetic Respondent",
    );
    expect(JSON.stringify(audit.safe_metadata)).not.toContain("+12025550123");
  });
  it("loads ordered public questions and autosaves encrypted typed answers", async () => {
    let state = await attempts.load(publicId, attemptToken);
    expect(state.questions.map((q) => q.type)).toEqual([
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "FREE_TEXT",
    ]);
    expect(state.questions[0]?.options.map((o) => o.label)).toEqual([
      "Alpha",
      "Beta",
    ]);
    state = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 1,
      value: 2,
      generation: 1,
      baseRevision: 0,
      mutationId: "70000000-0000-4000-8000-000000000001",
    });
    state = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 2,
      value: [2, 1],
      generation: 1,
      baseRevision: 1,
      mutationId: "70000000-0000-4000-8000-000000000002",
    });
    state = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 3,
      value: "Synthetic secret answer",
      generation: 1,
      baseRevision: 2,
      mutationId: "70000000-0000-4000-8000-000000000003",
    });
    expect(state.answers).toEqual({
      "1": 2,
      "2": [1, 2],
      "3": "Synthetic secret answer",
    });
    expect(state.revision).toBe(3);
    const stored = (
      await pool.query(
        "SELECT payload_ciphertext::STRING encoded,answered_question_count FROM response_attempts WHERE attempt_token_hash IS NOT NULL AND survey_id=$1 ORDER BY created_at LIMIT 1",
        [surveyId],
      )
    ).rows[0];
    expect(stored.answered_question_count).toBe(3);
    expect(stored.encoded).not.toContain("Synthetic secret answer");
  });
  it("keeps retries idempotent and refuses stale or invalid answer values", async () => {
    const replay = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 3,
      value: "Synthetic secret answer",
      generation: 1,
      baseRevision: 2,
      mutationId: "70000000-0000-4000-8000-000000000003",
    });
    expect(replay.revision).toBe(3);
    const stale = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 1,
      value: 1,
      generation: 1,
      baseRevision: 0,
      mutationId: "70000000-0000-4000-8000-000000000004",
    });
    expect(stale.revision).toBe(3);
    await expect(
      attempts.mutate(publicId, attemptToken, {
        questionPosition: 1,
        value: [1, 2],
        generation: 1,
        baseRevision: 3,
        mutationId: "70000000-0000-4000-8000-000000000005",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ANSWER" });
  });
  it("validates required answers on Submit while keeping analytical completion distinct", async () => {
    expect(
      await attempts.submit(publicId, attemptToken, {
        generation: 1,
        baseRevision: 3,
      }),
    ).toEqual({ submitted: true, analyticallyComplete: true });
    let state = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 2,
      value: null,
      generation: 1,
      baseRevision: 3,
      mutationId: "70000000-0000-4000-8000-000000000006",
    });
    expect(
      await attempts.submit(publicId, attemptToken, {
        generation: 1,
        baseRevision: state.revision,
      }),
    ).toEqual({ submitted: true, analyticallyComplete: false });
    state = await attempts.mutate(publicId, attemptToken, {
      questionPosition: 1,
      value: null,
      generation: 1,
      baseRevision: state.revision,
      mutationId: "70000000-0000-4000-8000-000000000007",
    });
    expect(
      await attempts.submit(publicId, attemptToken, {
        generation: 1,
        baseRevision: state.revision,
      }),
    ).toEqual({ submitted: false, missingRequiredPositions: [1] });
    await attempts.mutate(publicId, attemptToken, {
      questionPosition: 1,
      value: 1,
      generation: 1,
      baseRevision: state.revision,
      mutationId: "70000000-0000-4000-8000-000000000008",
    });
  });
  it("enforces the exact 24-hour edit boundary server-side", async () => {
    const row = (
      await pool.query(
        "SELECT last_answer_changed_at FROM response_attempts WHERE attempt_token_hash IS NOT NULL AND survey_id=$1",
        [surveyId],
      )
    ).rows[0];
    const expired = new PublicAttemptService(
      pool,
      crypto,
      () => new Date(row.last_answer_changed_at.getTime() + 86_400_000),
    );
    await expect(
      expired.mutate(publicId, attemptToken, {
        questionPosition: 1,
        value: 2,
        generation: 1,
        baseRevision: 6,
        mutationId: "70000000-0000-4000-8000-000000000009",
      }),
    ).rejects.toMatchObject({ code: "ATTEMPT_CONFLICT" });
  });
  it("atomically replaces a new-device same-phone attempt and retains archived answers", async () => {
    const second = await respondents.open(publicId, undefined, "phase6-open-b");
    const result = await respondents.identify(
      publicId,
      second.newOpenToken,
      { name: "Alternate", phone: "+1 202 555 0123", country: "US" },
      "phase6-identify-b",
    );
    expect(result.newAttemptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    replacementToken = result.newAttemptToken!;
    await expect(attempts.load(publicId, attemptToken)).rejects.toMatchObject({
      code: "ATTEMPT_UNAVAILABLE",
    });
    const replacement = await attempts.load(publicId, result.newAttemptToken);
    expect(replacement.answers).toEqual({});
    expect(replacement.generation).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM respondents WHERE survey_id=$1",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(1);
    const archived = (
      await pool.query(
        "SELECT status,archive_reason,attempt_token_hash,payload_ciphertext FROM response_attempts WHERE survey_id=$1 ORDER BY generation",
        [surveyId],
      )
    ).rows;
    expect(archived.map((row) => row.status)).toEqual(["ARCHIVED", "CURRENT"]);
    expect(archived[0]).toMatchObject({
      archive_reason: "REPLACED",
      attempt_token_hash: null,
    });
    expect(archived[0].payload_ciphertext).not.toEqual(
      archived[1].payload_ciphertext,
    );
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM public_survey_sessions WHERE survey_id=$1 AND respondent_id IS NOT NULL",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM response_attempts WHERE survey_id=$1 AND status='CURRENT'",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("serializes simultaneous same-phone starts into one Respondent and CURRENT attempt", async () => {
    const [left, right] = await Promise.all([
      respondents.open(publicId, undefined, "phase6-race-left"),
      respondents.open(publicId, undefined, "phase6-race-right"),
    ]);
    const results = await Promise.all([
      respondents.identify(
        publicId,
        left.newOpenToken,
        { name: "Race Left", phone: "+447911123456", country: "GB" },
        "phase6-race-left",
      ),
      respondents.identify(
        publicId,
        right.newOpenToken,
        { name: "Race Right", phone: "+447911123456", country: "GB" },
        "phase6-race-right",
      ),
    ]);
    expect(results.filter((result) => result.newAttemptToken)).toHaveLength(2);
    const phoneGroups = await pool.query<{
      respondents: number;
      attempts: number;
    }>(
      `SELECT count(DISTINCT r.id)::INT4 AS respondents,count(DISTINCT a.id)::INT4 AS attempts
         FROM respondents r LEFT JOIN response_attempts a ON a.respondent_id=r.id
        WHERE r.survey_id=$1 AND r.phone_lookup_hash=(SELECT phone_lookup_hash FROM respondents WHERE survey_id=$1 ORDER BY created_at DESC LIMIT 1)`,
      [surveyId],
    );
    expect(phoneGroups.rows[0]).toEqual({ respondents: 1, attempts: 2 });
  });
  it("creates immutable aggregate-only snapshots and enforces owner/Admin authorization", async () => {
    let state = await attempts.mutate(publicId, replacementToken, {
      questionPosition: 1,
      value: 1,
      generation: 2,
      baseRevision: 0,
      mutationId: "70000000-0000-4000-8000-000000000020",
    });
    state = await attempts.mutate(publicId, replacementToken, {
      questionPosition: 2,
      value: [1, 2],
      generation: 2,
      baseRevision: state.revision,
      mutationId: "70000000-0000-4000-8000-000000000021",
    });
    await attempts.mutate(publicId, replacementToken, {
      questionPosition: 3,
      value: "Grouped Secret",
      generation: 2,
      baseRevision: state.revision,
      mutationId: "70000000-0000-4000-8000-000000000022",
    });
    const first = await resultsService.calculate(owner, surveyId);
    expect(first.snapshotNumber).toBe(1);
    expect(first.funnel.completed).toBe(1);
    expect(first.questions[0]?.options?.[0]).toMatchObject({
      count: 1,
      leader: true,
    });
    expect(first.questions[1]?.options?.map((o) => o.count)).toEqual([1, 1]);
    expect(first.questions[2]?.freeTextGroups?.[0]).toMatchObject({
      label: "Grouped Secret",
      count: 1,
      leader: true,
    });
    const second = await resultsService.calculate(admin, surveyId);
    expect(second.snapshotNumber).toBe(2);
    const history = await resultsService.history(owner, surveyId);
    expect(history.map((s) => s.snapshotNumber)).toEqual([2, 1]);
    expect(
      await resultsService.history(
        { ...owner, id: "60000000-0000-4000-8000-000000000099" },
        surveyId,
      ),
    ).toHaveLength(2);
    await expect(
      resultsService.calculate(
        { ...owner, id: "60000000-0000-4000-8000-000000000099" },
        surveyId,
      ),
    ).rejects.toMatchObject({ code: "RESULTS_DENIED" });
    const stored = (
      await pool.query(
        "SELECT aggregate_results::STRING aggregate,free_text_ciphertext::STRING encrypted FROM results_snapshots WHERE survey_id=$1 ORDER BY snapshot_number LIMIT 1",
        [surveyId],
      )
    ).rows[0];
    expect(stored.aggregate).not.toContain("Grouped Secret");
    expect(stored.encrypted).not.toContain("Grouped Secret");
  });
  it("blocks stale identity after ACTIVE changes to PENDING and still records PENDING Opens", async () => {
    let survey = await surveys.view(owner, surveyId);
    await surveys.transition(
      owner,
      surveyId,
      "PENDING_CAPACITY",
      survey.stateVersion,
    );
    const pending = await respondents.open(
      publicId,
      undefined,
      "phase6-pending",
    );
    expect(pending.availability).toBe("PENDING");
    const existing = await attempts.load(publicId, replacementToken);
    expect(existing.editable).toBe(true);
    const continued = await attempts.mutate(publicId, replacementToken, {
      questionPosition: 3,
      value: "Continued while pending",
      generation: 2,
      baseRevision: 3,
      mutationId: "70000000-0000-4000-8000-000000000010",
    });
    expect(continued.revision).toBe(4);
    expect(
      await attempts.submit(publicId, replacementToken, {
        generation: 2,
        baseRevision: 4,
      }),
    ).toEqual({ submitted: true, analyticallyComplete: true });
    await expect(
      respondents.identify(
        publicId,
        pending.newOpenToken,
        { name: "Blocked", phone: "+442079460123", country: "GB" },
        "phase6-pending-identify",
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_SURVEY_UNAVAILABLE" });
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM respondents WHERE survey_id=$1",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(2);
    survey = await surveys.view(owner, surveyId);
    expect(
      (await resultsService.calculate(owner, surveyId)).snapshotNumber,
    ).toBe(3);
    await surveys.transition(owner, surveyId, "ACTIVE", survey.stateVersion);
  });
  it("keeps Draft, Completed, tombstoned, unknown, and malformed links unavailable", async () => {
    const draftId = (
      await surveys.create(owner, { title: "Draft", questions: [] })
    ).id;
    const draft = await surveys.view(owner, draftId);
    await expect(
      resultsService.calculate(owner, draftId),
    ).rejects.toMatchObject({ code: "RESULTS_UNAVAILABLE" });
    expect(
      (await respondents.open(draft.publicId, undefined, "draft")).availability,
    ).toBe("UNAVAILABLE");
    const survey = await surveys.view(owner, surveyId);
    await surveys.transition(owner, surveyId, "COMPLETED", survey.stateVersion);
    expect(
      (await resultsService.calculate(admin, surveyId)).snapshotNumber,
    ).toBe(4);
    expect((await surveys.view(owner, surveyId)).status).toBe("COMPLETED");
    const completed = await attempts.load(publicId, replacementToken);
    expect(completed).toMatchObject({ editable: false, recorded: true });
    await expect(
      attempts.mutate(publicId, replacementToken, {
        questionPosition: 1,
        value: 1,
        generation: 2,
        baseRevision: 4,
        mutationId: "70000000-0000-4000-8000-000000000011",
      }),
    ).rejects.toMatchObject({ code: "ATTEMPT_CONFLICT" });
    expect(
      (await respondents.open(publicId, undefined, "completed")).availability,
    ).toBe("UNAVAILABLE");
    await surveys.remove(admin, surveyId);
    expect(
      (await respondents.open(publicId, undefined, "tombstone")).availability,
    ).toBe("UNAVAILABLE");
    expect(
      (await respondents.open("Z".repeat(22), undefined, "unknown"))
        .availability,
    ).toBe("UNAVAILABLE");
    await expect(
      respondents.open("bad", undefined, "malformed"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
