import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgSurveyRepository } from "@/server/modules/surveys/repository";
import { SurveyService } from "@/server/modules/surveys/service";
import type { EmployeePrincipal } from "@/types/employee";

const { Pool } = pg;
const ownerId = "50000000-0000-4000-8000-000000000001";
const adminId = "50000000-0000-4000-8000-000000000002";
const owner: EmployeePrincipal = {
  id: ownerId,
  email: "phase5-owner@synthetic.invalid",
  displayName: "Phase 5 Owner",
  role: "PRODUCT_MANAGER",
  authorizationVersion: 1,
};
const admin: EmployeePrincipal = {
  ...owner,
  id: adminId,
  email: "phase5-admin@synthetic.invalid",
  displayName: "Phase 5 Admin",
  role: "ADMIN",
};
const input = {
  title: "Phase 5 survey",
  description: "Synthetic",
  questions: [
    {
      prompt: "Choose one",
      type: "SINGLE_CHOICE" as const,
      required: true,
      options: ["First", "Second"],
    },
    {
      prompt: "Comment",
      type: "FREE_TEXT" as const,
      required: false,
      options: [],
    },
  ],
};

describe("Phase 5 survey persistence", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new PgSurveyRepository(pool);
  const service = new SurveyService(repository);
  let surveyId: string;
  beforeAll(async () => {
    const now = new Date();
    await pool.query(
      `INSERT INTO users (id,email_normalized,display_name,email_verified,role,authorization_version,created_at,updated_at) VALUES ($1,'phase5-owner@synthetic.invalid','Phase 5 Owner',true,'PRODUCT_MANAGER',1,$3,$3),($2,'phase5-admin@synthetic.invalid','Phase 5 Admin',true,'ADMIN',1,$3,$3)`,
      [ownerId, adminId, now],
    );
  });
  afterAll(async () => pool.end());
  it("creates the complete instrument transactionally with deterministic ordering and ownership", async () => {
    surveyId = (await service.create(owner, input)).id;
    const survey = await service.view(owner, surveyId);
    expect(survey).toMatchObject({
      ownerId,
      title: input.title,
      status: "DRAFT",
      questionCount: 2,
    });
    expect(survey.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(survey.questions.map((q) => q.position)).toEqual([1, 2]);
    expect(survey.questions[0]?.options).toEqual(["First", "Second"]);
  });
  it("rolls back the entire replacement when a database invariant fails", async () => {
    const before = await service.view(owner, surveyId);
    await expect(
      pool.query(
        "INSERT INTO answer_options (id,question_id,survey_id,position,label,created_at,updated_at) VALUES ($1,$2,$3,12,'invalid',now(),now())",
        [randomUUID(), before.questions[0]!.id, surveyId],
      ),
    ).rejects.toBeTruthy();
    expect((await service.view(owner, surveyId)).questions[0]?.options).toEqual(
      ["First", "Second"],
    );
  });
  it("activates, audits, rejects stale transitions, and freezes mutation", async () => {
    await service.transition(owner, surveyId, "ACTIVE", 1);
    await expect(
      service.transition(owner, surveyId, "PENDING_CAPACITY", 1),
    ).rejects.toMatchObject({ code: "SURVEY_CONFLICT" });
    await expect(service.update(owner, surveyId, input)).rejects.toMatchObject({
      code: "SURVEY_CONFLICT",
    });
    expect(
      (
        await pool.query(
          "SELECT action FROM audit_events WHERE survey_id=$1 ORDER BY created_at",
          [surveyId],
        )
      ).rows.map((r) => r.action),
    ).toContain("SURVEY_ACTIVE");
  });
  it("pauses, reactivates, completes permanently, and duplicates instrument only", async () => {
    let survey = await service.view(owner, surveyId);
    await service.transition(
      owner,
      surveyId,
      "PENDING_CAPACITY",
      survey.stateVersion,
    );
    survey = await service.view(owner, surveyId);
    expect(survey.pauseReason).toBe("MANUAL");
    await service.transition(owner, surveyId, "ACTIVE", survey.stateVersion);
    survey = await service.view(owner, surveyId);
    await service.transition(owner, surveyId, "COMPLETED", survey.stateVersion);
    survey = await service.view(owner, surveyId);
    expect(survey.status).toBe("COMPLETED");
    await expect(
      service.transition(owner, surveyId, "ACTIVE", survey.stateVersion),
    ).rejects.toMatchObject({ code: "SURVEY_CONFLICT" });
    const copy = await service.duplicate(admin, surveyId);
    expect(await service.view(admin, copy.id)).toMatchObject({
      ownerId: adminId,
      status: "DRAFT",
      questionCount: 2,
    });
  });
  it("hard-deletes an empty data-free Draft and tombstones retained history", async () => {
    const empty = (
      await service.create(owner, { title: "Empty", questions: [] })
    ).id;
    await expect(service.remove(admin, empty)).resolves.toEqual({
      tombstoned: false,
    });
    await expect(service.view(admin, empty)).rejects.toMatchObject({
      code: "SURVEY_NOT_FOUND",
    });
    await expect(service.remove(admin, surveyId)).resolves.toEqual({
      tombstoned: true,
    });
    expect((await service.list(admin)).some((s) => s.id === surveyId)).toBe(
      false,
    );
    expect(
      (
        await pool.query(
          "SELECT status,tombstoned_at FROM surveys WHERE id=$1",
          [surveyId],
        )
      ).rows[0],
    ).toMatchObject({ status: "COMPLETED" });
  });
});
