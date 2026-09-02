import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, hashSecureToken } from "@/server/modules/cryptography";
import type {
  InvitationMail,
  InvitationMailAdapter,
} from "@/server/modules/auth/mail";
import { AuthRateLimiter } from "@/server/modules/auth/rate-limit";
import { PgAuthRepository } from "@/server/modules/auth/repository";
import { EmployeeAuthService } from "@/server/modules/auth/service";
import { PgEmployeeManagementRepository } from "@/server/modules/employees/repository";
import {
  EmployeeManagementService,
  INVITATION_LIFETIME_MS,
} from "@/server/modules/employees/service";
import type { EmployeePrincipal } from "@/types/employee";

const { Pool } = pg;
const adminId = "40000000-0000-4000-8000-000000000001";
const adminEmail = "phase4-admin@synthetic.invalid";
const adminPassword = "phase four admin password";
const employeePassword = "phase four employee password";
class Mail implements InvitationMailAdapter {
  messages: InvitationMail[] = [];
  async sendInvitation(message: InvitationMail) {
    this.messages.push(message);
  }
}
describe("Phase 4 employee management persistence", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new PgEmployeeManagementRepository(pool);
  const authRepository = new PgAuthRepository(pool);
  const mail = new Mail();
  let now = new Date("2026-08-27T12:00:00Z");
  const management = new EmployeeManagementService(
    repository,
    mail,
    "http://localhost:3000",
    () => now,
  );
  const auth = new EmployeeAuthService(
    authRepository,
    new AuthRateLimiter(authRepository, Buffer.alloc(32, 91)),
    { sendPasswordReset: async () => {} },
    "http://localhost:3000",
    () => now,
  );
  const admin: EmployeePrincipal = {
    id: adminId,
    email: adminEmail,
    displayName: "Phase 4 Admin",
    role: "ADMIN",
    authorizationVersion: 1,
  };
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id,email_normalized,display_name,email_verified,role,authorization_version,created_at,updated_at) VALUES ($1,$2,'Phase 4 Admin',true,'ADMIN',1,$3,$3)`,
      [adminId, adminEmail, now],
    );
    await pool.query(
      `INSERT INTO auth_accounts (id,user_id,issuer,provider_id,account_id,password_hash,created_at,updated_at) VALUES ($1,$2,'local','credential',$3,$4,$5,$5)`,
      [
        randomUUID(),
        adminId,
        adminEmail,
        await hashPassword(adminPassword),
        now,
      ],
    );
  });
  afterAll(async () => pool.end());
  it("creates, rotates, accepts once, stores Argon2id, audits safely, and invalidates sessions", async () => {
    const created = await management.createInvitation(admin, {
      email: " PM.Synthetic@Example.com ",
      role: "PRODUCT_MANAGER",
    });
    expect(created.expiresAt.getTime() - now.getTime()).toBe(
      INVITATION_LIFETIME_MS,
    );
    const oldToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    const stored = await pool.query<{
      token_hash: Buffer;
      token_expires_at: Date;
    }>(
      "SELECT token_hash,token_expires_at FROM employee_invitations WHERE id=$1",
      [created.invitationId],
    );
    expect(stored.rows[0].token_hash.equals(hashSecureToken(oldToken))).toBe(
      true,
    );
    expect(JSON.stringify(stored.rows[0])).not.toContain(oldToken);
    await management.resend(admin, created.invitationId);
    const newToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    expect(newToken).not.toBe(oldToken);
    expect(await management.preview(oldToken)).toBeNull();
    expect(await management.preview(newToken)).toMatchObject({
      email: "pm.synthetic@example.com",
      state: "VALID",
    });
    await expect(
      management.accept({
        token: newToken,
        displayName: "Synthetic PM",
        password: employeePassword,
        passwordConfirmation: employeePassword,
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({ code: "INVALID_EMPLOYEE_REQUEST" });
    const accepted = await management.accept({
      token: newToken,
      displayName: "Synthetic PM",
      password: employeePassword,
      passwordConfirmation: employeePassword,
    });
    await expect(
      management.accept({
        token: newToken,
        displayName: "Again",
        password: employeePassword,
        passwordConfirmation: employeePassword,
      }),
    ).rejects.toBeTruthy();
    const user = await pool.query<{
      email_normalized: string;
      role: string;
      password_hash: string;
      token_hash: Buffer | null;
      token_expires_at: Date | null;
    }>(
      `SELECT u.email_normalized,u.role,a.password_hash,i.token_hash,i.token_expires_at FROM users u JOIN auth_accounts a ON a.user_id=u.id JOIN employee_invitations i ON i.registered_user_id=u.id WHERE u.id=$1`,
      [accepted.userId],
    );
    expect(user.rows[0]).toMatchObject({
      email_normalized: "pm.synthetic@example.com",
      role: "PRODUCT_MANAGER",
      token_hash: null,
      token_expires_at: null,
    });
    expect(user.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    const session = await auth.signIn({
      email: "pm.synthetic@example.com",
      password: employeePassword,
      ip: randomUUID(),
    });
    await management.changeRole(admin, accepted.userId, "RESEARCHER");
    expect(await auth.validateSession(session.token)).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT role,authorization_version FROM users WHERE id=$1",
          [accepted.userId],
        )
      ).rows[0],
    ).toMatchObject({ role: "RESEARCHER", authorization_version: 2 });
    const fresh = await auth.signIn({
      email: "pm.synthetic@example.com",
      password: employeePassword,
      ip: randomUUID(),
    });
    await management.disableEmployee(admin, accepted.userId);
    expect(await auth.validateSession(fresh.token)).toBeNull();
    await expect(
      auth.signIn({
        email: "pm.synthetic@example.com",
        password: employeePassword,
        ip: randomUUID(),
      }),
    ).rejects.toBeTruthy();
    await management.reenableEmployee(admin, accepted.userId);
    expect(await auth.validateSession(fresh.token)).toBeNull();
    await expect(
      auth.signIn({
        email: "pm.synthetic@example.com",
        password: employeePassword,
        ip: randomUUID(),
      }),
    ).resolves.toMatchObject({ employee: { role: "RESEARCHER" } });
    const audits = await pool.query<{ safe_metadata: unknown }>(
      "SELECT safe_metadata FROM audit_events WHERE target_id IN ($1,$2)",
      [created.invitationId, accepted.userId],
    );
    const serialized = JSON.stringify(audits.rows);
    expect(serialized).not.toContain(oldToken);
    expect(serialized).not.toContain(newToken);
    expect(serialized).not.toContain(employeePassword);
  });
  it("reuses a disabled unused invitation and classifies every existing-email state", async () => {
    const email = "reinvite@synthetic.invalid";
    const original = await management.createInvitation(admin, {
      email,
      role: "RESEARCHER",
    });
    const oldToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    const oldHash = hashSecureToken(oldToken);
    await management.disableInvitation(admin, original.invitationId);
    now = new Date(now.getTime() + 60 * 60 * 1000);
    const reactivated = await management.createInvitation(admin, {
      email,
      role: "ADMIN",
    });
    const newToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    expect(reactivated.invitationId).toBe(original.invitationId);
    expect(newToken).not.toBe(oldToken);
    expect(await management.preview(oldToken)).toBeNull();
    expect(await management.preview(newToken)).toMatchObject({
      email,
      state: "VALID",
    });
    expect(reactivated.expiresAt.getTime() - now.getTime()).toBe(
      INVITATION_LIFETIME_MS,
    );
    const rows = await pool.query<{
      count: string;
      assigned_role: string;
      status: string;
      token_hash: Buffer;
      disabled_by_id: string | null;
      disabled_at: Date | null;
    }>(
      `SELECT count(*) OVER () AS count, assigned_role, status, token_hash,
              disabled_by_id, disabled_at
         FROM employee_invitations WHERE email_normalized = $1`,
      [email],
    );
    expect(rows.rows[0]).toMatchObject({
      count: "1",
      assigned_role: "ADMIN",
      status: "INVITED",
      disabled_by_id: null,
      disabled_at: null,
    });
    expect(rows.rows[0].token_hash.equals(oldHash)).toBe(false);
    expect(rows.rows[0].token_hash.equals(hashSecureToken(newToken))).toBe(
      true,
    );
    await expect(
      management.createInvitation(admin, { email, role: "RESEARCHER" }),
    ).rejects.toMatchObject({
      message: "An invitation already exists for that email; use Resend.",
    });
    expect(
      (
        await pool.query<{ count: string }>(
          "SELECT count(*) AS count FROM employee_invitations WHERE email_normalized = $1",
          [email],
        )
      ).rows[0].count,
    ).toBe("1");
    await management.accept({
      token: newToken,
      displayName: "Reinvited Admin",
      password: employeePassword,
      passwordConfirmation: employeePassword,
    });
    await expect(
      management.createInvitation(admin, { email, role: "RESEARCHER" }),
    ).rejects.toMatchObject({
      message: "An active employee already exists for that email.",
    });
    const userId = (
      await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email_normalized = $1",
        [email],
      )
    ).rows[0].id;
    await management.disableEmployee(admin, userId);
    await expect(
      management.createInvitation(admin, { email, role: "RESEARCHER" }),
    ).rejects.toMatchObject({
      message: "A disabled employee already exists; use Re-enable.",
    });
    const auditRows = await pool.query<{ safe_metadata: unknown }>(
      "SELECT safe_metadata FROM audit_events WHERE target_id = $1",
      [original.invitationId],
    );
    const auditText = JSON.stringify(auditRows.rows);
    expect(auditText).not.toContain(oldToken);
    expect(auditText).not.toContain(newToken);
  });
  it("changes a pending invitation role before acceptance and audits the correction", async () => {
    const created = await management.createInvitation(admin, {
      email: "corrected-role@synthetic.invalid",
      role: "PRODUCT_MANAGER",
    });
    const token = new URL(mail.messages.at(-1)!.invitationUrl).searchParams.get(
      "token",
    )!;
    await management.changeInvitationRole(
      admin,
      created.invitationId,
      "RESEARCHER",
    );
    const accepted = await management.accept({
      token,
      displayName: "Corrected Role",
      password: employeePassword,
      passwordConfirmation: employeePassword,
    });
    expect(
      (
        await pool.query("SELECT role FROM users WHERE id=$1", [
          accepted.userId,
        ])
      ).rows[0].role,
    ).toBe("RESEARCHER");
    expect(
      (
        await pool.query(
          "SELECT count(*)::INT4 count FROM audit_events WHERE target_id=$1 AND action='EMPLOYEE_INVITATION_ROLE_CHANGED'",
          [created.invitationId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("rejects expired and disabled invitations and makes resend links single-use", async () => {
    await management.createInvitation(admin, {
      email: "expired@synthetic.invalid",
      role: "RESEARCHER",
    });
    const expiredToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    now = new Date(now.getTime() + INVITATION_LIFETIME_MS + 1);
    expect(await management.preview(expiredToken)).toMatchObject({
      state: "EXPIRED",
    });
    await expect(
      management.accept({
        token: expiredToken,
        displayName: "Expired",
        password: employeePassword,
        passwordConfirmation: employeePassword,
      }),
    ).rejects.toBeTruthy();
    now = new Date("2026-08-27T12:00:00Z");
    const disabled = await management.createInvitation(admin, {
      email: "disabled-invite@synthetic.invalid",
      role: "ADMIN",
    });
    const disabledToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    await management.disableInvitation(admin, disabled.invitationId);
    expect(await management.preview(disabledToken)).toBeNull();
  });
  it("enforces 15 active users, excludes invitations/disabled users, and accepts one concurrent use", async () => {
    await management.createInvitation(admin, {
      email: "capacity@synthetic.invalid",
      role: "RESEARCHER",
    });
    const candidateToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    await management.createInvitation(admin, {
      email: "capacity-race@synthetic.invalid",
      role: "RESEARCHER",
    });
    const racingToken = new URL(
      mail.messages.at(-1)!.invitationUrl,
    ).searchParams.get("token")!;
    const active = Number(
      (
        await pool.query<{ count: string }>(
          "SELECT count(*) AS count FROM users WHERE disabled_at IS NULL",
        )
      ).rows[0].count,
    );
    for (let i = active; i < 15; i++) {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO users (id,email_normalized,display_name,role,updated_at) VALUES ($1,$2,$3,'RESEARCHER',$4)",
        [id, `capacity-${i}@synthetic.invalid`, `Capacity ${i}`, now],
      );
    }
    await expect(
      management.accept({
        token: candidateToken,
        displayName: "Capacity",
        password: employeePassword,
        passwordConfirmation: employeePassword,
      }),
    ).rejects.toMatchObject({ code: "EMPLOYEE_CAPACITY_REACHED" });
    const disposable = (
      await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email_normalized LIKE 'capacity-%' LIMIT 1",
      )
    ).rows[0].id;
    await management.disableEmployee(admin, disposable);
    const settled = await Promise.allSettled([
      management.accept({
        token: candidateToken,
        displayName: "Capacity",
        password: employeePassword,
        passwordConfirmation: employeePassword,
      }),
      management.accept({
        token: racingToken,
        displayName: "Capacity",
        password: employeePassword,
        passwordConfirmation: employeePassword,
      }),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*) AS count FROM users WHERE disabled_at IS NULL",
          )
        ).rows[0].count,
      ),
    ).toBe(15);
    await expect(
      management.reenableEmployee(admin, disposable),
    ).rejects.toMatchObject({ code: "EMPLOYEE_CAPACITY_REACHED" });
  });
});
