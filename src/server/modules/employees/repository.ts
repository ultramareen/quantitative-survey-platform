import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { getDatabasePool } from "@/server/database/pool";
import { withSerializableRetry } from "@/server/database/transaction";
import type { EmployeeRole } from "@/types/employee";
import type {
  EmployeeManagementRow,
  InvitationPreview,
} from "@/types/employee-management";

type InvitationRecord = {
  id: string;
  email: string;
  role: EmployeeRole;
  status: "INVITED" | "REGISTERED" | "DISABLED";
  registeredUserId: string | null;
  expiresAt: Date | null;
};

export interface EmployeeManagementRepository {
  list(): Promise<EmployeeManagementRow[]>;
  createInvitation(input: {
    actorId: string;
    email: string;
    role: EmployeeRole;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }): Promise<string>;
  previewInvitation(
    tokenHash: Buffer,
    now: Date,
  ): Promise<InvitationPreview | null>;
  acceptInvitation(input: {
    tokenHash: Buffer;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Promise<{ userId: string }>;
  resendInvitation(input: {
    actorId: string;
    invitationId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }): Promise<string>;
  disableInvitation(input: {
    actorId: string;
    invitationId: string;
    now: Date;
  }): Promise<void>;
  changeRole(input: {
    actorId: string;
    userId: string;
    role: EmployeeRole;
    now: Date;
  }): Promise<void>;
  disableEmployee(input: {
    actorId: string;
    userId: string;
    now: Date;
  }): Promise<void>;
  reenableEmployee(input: {
    actorId: string;
    userId: string;
    now: Date;
  }): Promise<void>;
}

export class PgEmployeeManagementRepository implements EmployeeManagementRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async list(): Promise<EmployeeManagementRow[]> {
    const result = await this.pool.query<{
      invitation_id: string | null;
      user_id: string | null;
      email: string;
      display_name: string | null;
      role: EmployeeRole;
      invitation_status: "INVITED" | "REGISTERED" | "DISABLED" | null;
      invited_at: Date | null;
      token_expires_at: Date | null;
      disabled_at: Date | null;
    }>(`SELECT i.id AS invitation_id, u.id AS user_id,
               COALESCE(i.email_normalized, u.email_normalized) AS email,
               u.display_name, COALESCE(i.assigned_role, u.role) AS role,
               i.status AS invitation_status, i.created_at AS invited_at,
               i.token_expires_at, u.disabled_at
          FROM employee_invitations i
          FULL OUTER JOIN users u ON u.id = i.registered_user_id
         ORDER BY COALESCE(i.created_at, u.created_at), email`);
    return result.rows.map((row) => ({
      invitationId: row.invitation_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status:
        row.invitation_status ?? (row.disabled_at ? "DISABLED" : "ACTIVE"),
      invitedAt: row.invited_at,
      tokenExpiresAt: row.token_expires_at,
      disabledAt: row.disabled_at,
    }));
  }

  async createInvitation(input: {
    actorId: string;
    email: string;
    role: EmployeeRole;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }) {
    let id: string = randomUUID();
    await this.transaction(async (client) => {
      const existingUser = await client.query<{ disabled_at: Date | null }>(
        "SELECT disabled_at FROM users WHERE email_normalized = $1 LIMIT 1",
        [input.email],
      );
      if (existingUser.rows[0])
        throw conflict(
          existingUser.rows[0].disabled_at
            ? "A disabled employee already exists; use Re-enable."
            : "An active employee already exists for that email.",
        );
      const existing = await client.query<{
        id: string;
        status: "INVITED" | "REGISTERED" | "DISABLED";
        registered_user_id: string | null;
        assigned_role: EmployeeRole;
      }>(
        "SELECT id, status, registered_user_id, assigned_role FROM employee_invitations WHERE email_normalized = $1 FOR UPDATE",
        [input.email],
      );
      const invitation = existing.rows[0];
      if (invitation) {
        if (invitation.status === "INVITED")
          throw conflict(
            "An invitation already exists for that email; use Resend.",
          );
        if (invitation.registered_user_id)
          throw conflict(
            "An employee already exists for that email; use Re-enable if disabled.",
          );
        if (invitation.status !== "DISABLED")
          throw conflict("That invitation cannot be reactivated.");
        id = invitation.id;
        await client.query(
          `UPDATE employee_invitations
           SET assigned_role = $2, status = 'INVITED', token_hash = $3,
               token_expires_at = $4, invited_by_id = $5,
               disabled_by_id = NULL, disabled_at = NULL, updated_at = $6
           WHERE id = $1`,
          [
            id,
            input.role,
            input.tokenHash,
            input.expiresAt,
            input.actorId,
            input.now,
          ],
        );
        await audit(
          client,
          input.actorId,
          "EMPLOYEE_INVITATION_REACTIVATED",
          "EmployeeInvitation",
          id,
          { oldRole: invitation.assigned_role, newRole: input.role },
          input.now,
        );
        return;
      }
      await client.query(
        `INSERT INTO employee_invitations
        (id, email_normalized, assigned_role, status, token_hash, token_expires_at,
         invited_by_id, created_at, updated_at)
        VALUES ($1, $2, $3, 'INVITED', $4, $5, $6, $7, $7)`,
        [
          id,
          input.email,
          input.role,
          input.tokenHash,
          input.expiresAt,
          input.actorId,
          input.now,
        ],
      );
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_INVITATION_CREATED",
        "EmployeeInvitation",
        id,
        { role: input.role },
        input.now,
      );
    });
    return id;
  }

  async previewInvitation(
    tokenHash: Buffer,
    now: Date,
  ): Promise<InvitationPreview | null> {
    const result = await this.pool.query<{
      email: string;
      expires_at: Date;
      status: string;
    }>(
      `SELECT email_normalized AS email, token_expires_at AS expires_at, status
         FROM employee_invitations WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      email: row.email,
      expiresAt: row.expires_at,
      state:
        row.status !== "INVITED"
          ? "UNAVAILABLE"
          : row.expires_at <= now
            ? "EXPIRED"
            : "VALID",
    };
  }

  async acceptInvitation(input: {
    tokenHash: Buffer;
    displayName: string;
    passwordHash: string;
    now: Date;
  }) {
    return this.transaction(async (client) => {
      const result = await client.query<InvitationRecord>(
        `SELECT id, email_normalized AS email,
          assigned_role AS role, status, registered_user_id AS "registeredUserId",
          token_expires_at AS "expiresAt"
        FROM employee_invitations WHERE token_hash = $1 FOR UPDATE`,
        [input.tokenHash],
      );
      const invitation = result.rows[0];
      if (
        !invitation ||
        invitation.status !== "INVITED" ||
        !invitation.expiresAt ||
        invitation.expiresAt <= input.now
      )
        throw unavailable();
      const count = await client.query<{ count: string }>(
        "SELECT count(*) AS count FROM users WHERE disabled_at IS NULL",
      );
      if (Number(count.rows[0]?.count ?? 0) >= 15) throw capacity();
      const userId = randomUUID();
      await client.query(
        `INSERT INTO users
        (id, email_normalized, display_name, email_verified, role, authorization_version, created_at, updated_at)
        VALUES ($1, $2, $3, true, $4, 1, $5, $5)`,
        [
          userId,
          invitation.email,
          input.displayName,
          invitation.role,
          input.now,
        ],
      );
      await client.query(
        `INSERT INTO auth_accounts
        (id, user_id, issuer, provider_id, account_id, password_hash, created_at, updated_at)
        VALUES ($1, $2, 'local', 'credential', $3, $4, $5, $5)`,
        [randomUUID(), userId, invitation.email, input.passwordHash, input.now],
      );
      const consumed = await client.query(
        `UPDATE employee_invitations
        SET status = 'REGISTERED', registered_user_id = $2, registered_at = $3,
            token_hash = NULL, token_expires_at = NULL, updated_at = $3
        WHERE id = $1 AND status = 'INVITED' AND token_hash = $4`,
        [invitation.id, userId, input.now, input.tokenHash],
      );
      if (consumed.rowCount !== 1) throw unavailable();
      await audit(
        client,
        userId,
        "EMPLOYEE_INVITATION_ACCEPTED",
        "EmployeeInvitation",
        invitation.id,
        { role: invitation.role },
        input.now,
      );
      return { userId };
    });
  }

  async resendInvitation(input: {
    actorId: string;
    invitationId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }) {
    return this.transaction(async (client) => {
      const invitation = await this.lockInvitation(client, input.invitationId);
      if (invitation.status !== "INVITED")
        throw conflict("Only an invited employee can be resent an invitation.");
      await client.query(
        `UPDATE employee_invitations SET token_hash = $2, token_expires_at = $3,
        updated_at = $4 WHERE id = $1`,
        [input.invitationId, input.tokenHash, input.expiresAt, input.now],
      );
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_INVITATION_RESENT",
        "EmployeeInvitation",
        input.invitationId,
        { role: invitation.role },
        input.now,
      );
      return invitation.email;
    });
  }

  async disableInvitation(input: {
    actorId: string;
    invitationId: string;
    now: Date;
  }) {
    await this.transaction(async (client) => {
      const invitation = await this.lockInvitation(client, input.invitationId);
      if (invitation.status !== "INVITED")
        throw conflict("Only an unused invitation can be disabled.");
      await client.query(
        `UPDATE employee_invitations SET status = 'DISABLED', token_hash = NULL,
        token_expires_at = NULL, disabled_by_id = $2, disabled_at = $3, updated_at = $3 WHERE id = $1`,
        [input.invitationId, input.actorId, input.now],
      );
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_INVITATION_DISABLED",
        "EmployeeInvitation",
        input.invitationId,
        { role: invitation.role },
        input.now,
      );
    });
  }

  async changeRole(input: {
    actorId: string;
    userId: string;
    role: EmployeeRole;
    now: Date;
  }) {
    await this.transaction(async (client) => {
      const user = await this.lockUser(client, input.userId);
      await client.query(
        "UPDATE users SET role = $2, authorization_version = authorization_version + 1, updated_at = $3 WHERE id = $1",
        [input.userId, input.role, input.now],
      );
      await client.query(
        "UPDATE employee_invitations SET assigned_role = $2, updated_at = $3 WHERE registered_user_id = $1",
        [input.userId, input.role, input.now],
      );
      await revokeSessions(client, input.userId, input.now);
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_ROLE_CHANGED",
        "User",
        input.userId,
        { oldRole: user.role, newRole: input.role },
        input.now,
      );
    });
  }

  async disableEmployee(input: { actorId: string; userId: string; now: Date }) {
    await this.transaction(async (client) => {
      await this.lockUser(client, input.userId);
      await client.query(
        "UPDATE users SET disabled_at = $2, authorization_version = authorization_version + 1, updated_at = $2 WHERE id = $1",
        [input.userId, input.now],
      );
      await client.query(
        `UPDATE employee_invitations SET status = 'DISABLED', token_hash = NULL,
        token_expires_at = NULL, disabled_by_id = $2, disabled_at = $3, updated_at = $3
        WHERE registered_user_id = $1`,
        [input.userId, input.actorId, input.now],
      );
      await revokeSessions(client, input.userId, input.now);
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_DISABLED",
        "User",
        input.userId,
        {},
        input.now,
      );
    });
  }

  async reenableEmployee(input: {
    actorId: string;
    userId: string;
    now: Date;
  }) {
    await this.transaction(async (client) => {
      await this.lockUser(client, input.userId);
      const count = await client.query<{ count: string }>(
        "SELECT count(*) AS count FROM users WHERE disabled_at IS NULL",
      );
      if (Number(count.rows[0]?.count ?? 0) >= 15) throw capacity();
      await client.query(
        "UPDATE users SET disabled_at = NULL, authorization_version = authorization_version + 1, updated_at = $2 WHERE id = $1",
        [input.userId, input.now],
      );
      await client.query(
        `UPDATE employee_invitations SET status = 'REGISTERED', disabled_by_id = NULL,
        disabled_at = NULL, token_hash = NULL, token_expires_at = NULL, updated_at = $2
        WHERE registered_user_id = $1`,
        [input.userId, input.now],
      );
      await revokeSessions(client, input.userId, input.now);
      await audit(
        client,
        input.actorId,
        "EMPLOYEE_REENABLED",
        "User",
        input.userId,
        {},
        input.now,
      );
    });
  }

  private async lockInvitation(client: PoolClient, id: string) {
    const result = await client.query<InvitationRecord>(
      `SELECT id, email_normalized AS email,
      assigned_role AS role, status, registered_user_id AS "registeredUserId",
      token_expires_at AS "expiresAt" FROM employee_invitations WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!result.rows[0]) throw conflict("Invitation was not found.");
    return result.rows[0];
  }

  private async lockUser(client: PoolClient, id: string) {
    const result = await client.query<{ role: EmployeeRole }>(
      "SELECT role FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!result.rows[0]) throw conflict("Employee was not found.");
    return result.rows[0];
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return withSerializableRetry(
      async () => {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
          const value = await work(client);
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      { maxAttempts: 5 },
    );
  }
}

async function audit(
  client: PoolClient,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: Date,
) {
  await client.query(
    `INSERT INTO audit_events
    (id, actor_user_id, action, target_type, target_id, result, affected_rows, safe_metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, 'SUCCESS', 1, $6, $7)`,
    [
      randomUUID(),
      actorId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      now,
    ],
  );
}

async function revokeSessions(client: PoolClient, userId: string, now: Date) {
  await client.query(
    `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2),
    updated_at = $2 WHERE user_id = $1`,
    [userId, now],
  );
}

function conflict(message: string) {
  return Object.assign(new Error(message), {
    code: "EMPLOYEE_CONFLICT",
    status: 409,
  });
}
function unavailable() {
  return Object.assign(
    new Error("This invitation is invalid, expired, or unavailable."),
    { code: "INVITATION_UNAVAILABLE", status: 400 },
  );
}
function capacity() {
  return Object.assign(
    new Error("The active employee limit has been reached."),
    { code: "EMPLOYEE_CAPACITY_REACHED", status: 409 },
  );
}
