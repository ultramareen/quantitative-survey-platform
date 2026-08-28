import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import { PgRespondentRepository } from "@/server/modules/respondents/repository";
import { PublicRespondentService } from "@/server/modules/respondents/service";
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
  let surveyId: string;
  let publicId: string;
  let openToken: string;
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
    const row = (
      await pool.query(
        `SELECT r.id,r.reference_id,r.name_ciphertext,r.phone_ciphertext,r.phone_lookup_hash,p.respondent_id,a.status,a.attempt_token_hash,a.coverage_basis_count FROM respondents r JOIN public_survey_sessions p ON p.respondent_id=r.id JOIN response_attempts a ON a.respondent_id=r.id WHERE r.survey_id=$1`,
        [surveyId],
      )
    ).rows[0];
    expect(row.reference_id).toMatch(/^R-/);
    expect(row.respondent_id).toBe(row.id);
    expect(row.status).toBe("CURRENT");
    expect(row.coverage_basis_count).toBe(1);
    expect(row.attempt_token_hash).toHaveLength(32);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Synthetic Respondent");
    expect(serialized).not.toContain("+12025550123");
    expect(row.phone_lookup_hash).toHaveLength(32);
  });
  it("links a new-device Open for the same phone without restoring or replacing the attempt", async () => {
    const second = await respondents.open(publicId, undefined, "phase6-open-b");
    const result = await respondents.identify(
      publicId,
      second.newOpenToken,
      { name: "Alternate", phone: "+1 202 555 0123", country: "US" },
      "phase6-identify-b",
    );
    expect(result).toEqual({ identified: true });
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 AS count FROM respondents WHERE survey_id=$1",
          [surveyId],
        )
      ).rows[0].count,
    ).toBe(1);
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
    expect(results.filter((result) => result.newAttemptToken)).toHaveLength(1);
    const phoneGroups = await pool.query<{
      respondents: number;
      attempts: number;
    }>(
      `SELECT count(DISTINCT r.id)::INT4 AS respondents,count(DISTINCT a.id)::INT4 AS attempts
         FROM respondents r LEFT JOIN response_attempts a ON a.respondent_id=r.id
        WHERE r.survey_id=$1 AND r.phone_lookup_hash=(SELECT phone_lookup_hash FROM respondents WHERE survey_id=$1 ORDER BY created_at DESC LIMIT 1)`,
      [surveyId],
    );
    expect(phoneGroups.rows[0]).toEqual({ respondents: 1, attempts: 1 });
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
    await surveys.transition(owner, surveyId, "ACTIVE", survey.stateVersion);
  });
  it("keeps Draft, Completed, tombstoned, unknown, and malformed links unavailable", async () => {
    const draftId = (
      await surveys.create(owner, { title: "Draft", questions: [] })
    ).id;
    const draft = await surveys.view(owner, draftId);
    expect(
      (await respondents.open(draft.publicId, undefined, "draft")).availability,
    ).toBe("UNAVAILABLE");
    const survey = await surveys.view(owner, surveyId);
    await surveys.transition(owner, surveyId, "COMPLETED", survey.stateVersion);
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
