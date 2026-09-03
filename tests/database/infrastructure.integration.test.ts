import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgInfrastructureRepository } from "@/server/modules/infrastructure/repository";
import { PgSurveyRepository } from "@/server/modules/surveys/repository";
import { SurveyService } from "@/server/modules/surveys/service";
import type { EmployeePrincipal } from "@/types/employee";

const { Pool } = pg;
const adminId = "c0000000-0000-4000-8000-000000000001";
const ownerId = "c0000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-29T12:00:00.000Z");

describe("Phase 12 infrastructure persistence and capacity invariants", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new PgInfrastructureRepository(pool, () => now);
  const surveyService = new SurveyService(new PgSurveyRepository(pool));
  const owner: EmployeePrincipal = {
    id: ownerId,
    email: "phase12-owner@synthetic.invalid",
    displayName: "Synthetic Phase 12 Owner",
    role: "PRODUCT_MANAGER",
    authorizationVersion: 1,
  };
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id,email_normalized,display_name,email_verified,role,authorization_version,created_at,updated_at)
       VALUES ($1,'phase12-admin@synthetic.invalid','Synthetic Phase 12 Admin',true,'ADMIN',1,now(),now()),
              ($2,'phase12-owner@synthetic.invalid','Synthetic Phase 12 Owner',true,'PRODUCT_MANAGER',1,now(),now())`,
      [adminId, ownerId],
    );
  });
  afterAll(async () => pool.end());

  async function survey(
    status: "DRAFT" | "ACTIVE" | "PENDING_CAPACITY" | "COMPLETED",
    title: string,
  ) {
    const id = randomUUID();
    const publicId = `phase12-${randomUUID()}`;
    await pool.query(
      `INSERT INTO surveys
        (id,public_id,owner_id,title,status,pause_reason,state_version,question_count,launched_at,paused_at,completed_at,state_changed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,1,now(),CASE WHEN $5='PENDING_CAPACITY' THEN now() ELSE NULL END,CASE WHEN $5='COMPLETED' THEN now() ELSE NULL END,now(),now(),now())`,
      [
        id,
        publicId,
        ownerId,
        title,
        status,
        status === "PENDING_CAPACITY" ? "MANUAL" : null,
      ],
    );
    return { id, publicId };
  }

  it("keeps exactly one ACTIVE at 95% and pauses every ACTIVE when there are two or more", async () => {
    await pool.query("DELETE FROM surveys WHERE owner_id=$1", [ownerId]);
    const only = await survey("ACTIVE", "Only active");
    expect(await repository.enforceCapacity(95)).toBe(0);
    expect(
      (await pool.query("SELECT status FROM surveys WHERE id=$1", [only.id]))
        .rows[0].status,
    ).toBe("ACTIVE");
    await survey("ACTIVE", "Second active");
    await survey("ACTIVE", "Third active");
    expect(await repository.enforceCapacity(95)).toBe(3);
    const rows = await pool.query(
      "SELECT status,pause_reason FROM surveys WHERE owner_id=$1",
      [ownerId],
    );
    expect(
      rows.rows.every(
        (row) =>
          row.status === "PENDING_CAPACITY" &&
          row.pause_reason === "INFRASTRUCTURE_CAPACITY",
      ),
    ).toBe(true);
  });

  it("performs Admin Pause All and a high-usage atomic switch with safe audits", async () => {
    await pool.query("DELETE FROM surveys WHERE owner_id=$1", [ownerId]);
    const paused = await survey("ACTIVE", "Active before pause");
    const selected = await survey("PENDING_CAPACITY", "Selected pending");
    const draft = await survey("DRAFT", "Draft unaffected");
    const completed = await survey("COMPLETED", "Completed unaffected");
    expect(await repository.pauseAll(adminId)).toBe(1);
    const unchanged = await pool.query(
      "SELECT id,status,pause_reason FROM surveys WHERE id=ANY($1::UUID[]) ORDER BY id",
      [[paused.id, selected.id, draft.id, completed.id]],
    );
    expect(unchanged.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: paused.id,
          status: "PENDING_CAPACITY",
          pause_reason: "MANUAL",
        }),
        expect.objectContaining({
          id: selected.id,
          status: "PENDING_CAPACITY",
        }),
        expect.objectContaining({ id: draft.id, status: "DRAFT" }),
        expect.objectContaining({ id: completed.id, status: "COMPLETED" }),
      ]),
    );
    await pool.query(
      "UPDATE infrastructure_control_state SET effective_percent=99 WHERE singleton_key='global'",
    );
    await repository.switchActive(adminId, selected.publicId);
    const active = await pool.query(
      "SELECT public_id FROM surveys WHERE status='ACTIVE' AND tombstoned_at IS NULL",
    );
    expect(active.rows).toEqual([{ public_id: selected.publicId }]);
    const audits = await pool.query(
      "SELECT action,safe_metadata FROM audit_events WHERE actor_user_id=$1 AND action LIKE 'INFRASTRUCTURE_%'",
      [adminId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "INFRASTRUCTURE_PAUSE_ALL",
        "INFRASTRUCTURE_ATOMIC_SWITCH",
      ]),
    );
    expect(JSON.stringify(audits.rows)).not.toContain(selected.publicId);
  });

  it("serializes concurrent owner reactivation at 95% so only one becomes ACTIVE", async () => {
    await pool.query("DELETE FROM surveys WHERE owner_id=$1", [ownerId]);
    const first = await survey("PENDING_CAPACITY", "Concurrent first");
    const second = await survey("PENDING_CAPACITY", "Concurrent second");
    for (const item of [first, second])
      await pool.query(
        `INSERT INTO questions
          (id,survey_id,position,type,prompt,required,created_at,updated_at)
         VALUES ($1,$2,1,'FREE_TEXT','Synthetic capacity question',false,now(),now())`,
        [randomUUID(), item.id],
      );
    await pool.query(
      "UPDATE infrastructure_control_state SET effective_percent=95 WHERE singleton_key='global'",
    );
    const attempts = await Promise.allSettled([
      surveyService.transition(owner, first.id, "ACTIVE", 1),
      surveyService.transition(owner, second.id, "ACTIVE", 1),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS count FROM surveys WHERE owner_id=$1 AND status='ACTIVE'",
            [ownerId],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
  });

  it("deduplicates deployment IDs and alert thresholds per provider/quota/period", async () => {
    await repository.observeDeployment({
      deploymentId: "synthetic-deploy-1",
      production: true,
      observedAt: now,
    });
    await repository.observeDeployment({
      deploymentId: "synthetic-deploy-1",
      production: true,
      observedAt: now,
    });
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS count FROM infrastructure_deployments WHERE provider_deployment_id='synthetic-deploy-1'",
          )
        ).rows[0].count,
      ),
    ).toBe(1);
    const readings = await repository.evaluate(now);
    const high = readings.map((item) =>
      item.provider === "NETLIFY" && item.quota === "CREDITS"
        ? { ...item, percent: 99 }
        : item,
    );
    expect(await repository.reserveThresholds(high)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "NETLIFY", threshold: 99 }),
      ]),
    );
    expect(await repository.reserveThresholds(high)).toEqual([]);
  });
});
