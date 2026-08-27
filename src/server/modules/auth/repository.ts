import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { getDatabasePool } from "@/server/database/pool";
import type { EmployeePrincipal, EmployeeRole, SessionRecord } from "./types";

type CredentialRecord = EmployeePrincipal & {
  passwordHash: string;
  disabledAt: Date | null;
};

type ResetRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  disabledAt: Date | null;
};

export interface AuthRepository {
  findCredential(emailNormalized: string): Promise<CredentialRecord | null>;
  createSession(input: {
    userId: string;
    tokenHash: Buffer;
    authorizationVersion: number;
    now: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<void>;
  findSession(tokenHash: Buffer): Promise<SessionRecord | null>;
  touchSession(
    sessionId: string,
    lastSeenAt: Date,
    idleExpiresAt: Date,
  ): Promise<void>;
  revokeSession(tokenHash: Buffer, now: Date): Promise<void>;
  createPasswordReset(input: {
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  consumePasswordReset(input: {
    tokenHash: Buffer;
    passwordHash: string;
    now: Date;
  }): Promise<boolean>;
  incrementRateLimit(input: {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<number>;
}

export class PgAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async findCredential(emailNormalized: string) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: EmployeeRole;
      authorization_version: number;
      disabled_at: Date | null;
      password_hash: string;
    }>(
      `SELECT u.id, u.email_normalized AS email, u.display_name, u.role,
              u.authorization_version, u.disabled_at, a.password_hash
         FROM users u
         JOIN auth_accounts a ON a.user_id = u.id
        WHERE u.email_normalized = $1
          AND a.issuer = 'local' AND a.provider_id = 'credential'
        LIMIT 1`,
      [emailNormalized],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          role: row.role,
          authorizationVersion: row.authorization_version,
          disabledAt: row.disabled_at,
          passwordHash: row.password_hash,
        }
      : null;
  }

  async createSession(input: {
    userId: string;
    tokenHash: Buffer;
    authorizationVersion: number;
    now: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }) {
    await this.pool.query(
      `INSERT INTO auth_sessions
        (id, user_id, token_hash, authorization_version, idle_expires_at,
         absolute_expires_at, last_seen_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $7)`,
      [
        randomUUID(),
        input.userId,
        input.tokenHash,
        input.authorizationVersion,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
        input.now,
      ],
    );
  }

  async findSession(tokenHash: Buffer) {
    const result = await this.pool.query<{
      session_id: string;
      id: string;
      email: string;
      display_name: string;
      role: EmployeeRole;
      authorization_version: number;
      session_authorization_version: number;
      idle_expires_at: Date;
      absolute_expires_at: Date;
      revoked_at: Date | null;
      disabled_at: Date | null;
    }>(
      `SELECT s.id AS session_id, u.id, u.email_normalized AS email,
              u.display_name, u.role, u.authorization_version,
              s.authorization_version AS session_authorization_version,
              s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
              u.disabled_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          sessionId: row.session_id,
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          role: row.role,
          authorizationVersion: row.authorization_version,
          sessionAuthorizationVersion: row.session_authorization_version,
          idleExpiresAt: row.idle_expires_at,
          absoluteExpiresAt: row.absolute_expires_at,
          revokedAt: row.revoked_at,
          disabledAt: row.disabled_at,
        }
      : null;
  }

  async touchSession(sessionId: string, lastSeenAt: Date, idleExpiresAt: Date) {
    await this.pool.query(
      `UPDATE auth_sessions SET last_seen_at = $2, idle_expires_at = $3,
              updated_at = $2 WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, lastSeenAt, idleExpiresAt],
    );
  }

  async revokeSession(tokenHash: Buffer, now: Date) {
    await this.pool.query(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2),
              updated_at = $2 WHERE token_hash = $1`,
      [tokenHash, now],
    );
  }

  async createPasswordReset(input: {
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE password_reset_tokens SET used_at = $2
          WHERE user_id = $1 AND used_at IS NULL`,
        [input.userId, input.now],
      );
      await client.query(
        `INSERT INTO password_reset_tokens
          (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          input.userId,
          input.tokenHash,
          input.expiresAt,
          input.now,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async consumePasswordReset(input: {
    tokenHash: Buffer;
    passwordHash: string;
    now: Date;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ResetRecord>(
        `SELECT t.id, t.user_id AS "userId", t.expires_at AS "expiresAt",
                t.used_at AS "usedAt", u.disabled_at AS "disabledAt"
           FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 FOR UPDATE`,
        [input.tokenHash],
      );
      const token = result.rows[0];
      if (
        !token ||
        token.usedAt ||
        token.disabledAt ||
        token.expiresAt <= input.now
      ) {
        await client.query("ROLLBACK");
        return false;
      }
      await updatePasswordAndRevoke(
        client,
        token.userId,
        input.passwordHash,
        input.now,
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async incrementRateLimit(input: {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<number> {
    const result = await this.pool.query<{ hit_count: number }>(
      `INSERT INTO security_rate_limits
        (id, scope, subject_hash, window_start, expires_at, hit_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, now())
       ON CONFLICT (scope, subject_hash, window_start)
       DO UPDATE SET hit_count = security_rate_limits.hit_count + 1,
                     updated_at = now()
       RETURNING hit_count`,
      [
        randomUUID(),
        input.scope,
        input.subjectHash,
        input.windowStart,
        input.expiresAt,
      ],
    );
    return result.rows[0]?.hit_count ?? 1;
  }
}

async function updatePasswordAndRevoke(
  client: PoolClient,
  userId: string,
  passwordHash: string,
  now: Date,
) {
  await client.query(
    `UPDATE auth_accounts SET password_hash = $2, updated_at = $3
      WHERE user_id = $1 AND issuer = 'local' AND provider_id = 'credential'`,
    [userId, passwordHash, now],
  );
  await client.query(
    `UPDATE password_reset_tokens SET used_at = COALESCE(used_at, $2)
      WHERE user_id = $1`,
    [userId, now],
  );
  await client.query(
    `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2),
            updated_at = $2 WHERE user_id = $1`,
    [userId, now],
  );
}
