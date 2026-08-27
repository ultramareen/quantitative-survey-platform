import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/modules/cryptography";
import type {
  AuthMailAdapter,
  PasswordResetMail,
} from "@/server/modules/auth/mail";
import { AuthRateLimiter } from "@/server/modules/auth/rate-limit";
import { PgAuthRepository } from "@/server/modules/auth/repository";
import { EmployeeAuthService } from "@/server/modules/auth/service";

const { Pool } = pg;
const userId = "30000000-0000-4000-8000-000000000001";
const accountId = "30000000-0000-4000-8000-000000000002";
const email = "phase3-auth@synthetic.invalid";
const originalPassword = "phase three original password";
const replacementPassword = "phase three replacement password";

class CapturingMail implements AuthMailAdapter {
  messages: PasswordResetMail[] = [];
  async sendPasswordReset(message: PasswordResetMail) {
    this.messages.push(message);
  }
}

describe("Phase 3 authentication persistence", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new PgAuthRepository(pool);
  const mail = new CapturingMail();
  const service = new EmployeeAuthService(
    repository,
    new AuthRateLimiter(repository, Buffer.alloc(32, 81)),
    mail,
    "http://localhost:3000",
  );

  beforeAll(async () => {
    const now = new Date();
    await pool.query(
      `INSERT INTO users
        (id, email_normalized, display_name, email_verified, role, updated_at)
       VALUES ($1, $2, 'Phase 3 Synthetic Admin', true, 'ADMIN', $3)`,
      [userId, email, now],
    );
    await pool.query(
      `INSERT INTO auth_accounts
        (id, user_id, issuer, provider_id, account_id, password_hash, updated_at)
       VALUES ($1, $2, 'local', 'credential', $3, $4, $5)`,
      [accountId, userId, email, await hashPassword(originalPassword), now],
    );
  });

  afterAll(async () => pool.end());

  it("authenticates, stores no raw session token, and revokes logout", async () => {
    const signedIn = await service.signIn({
      email: email.toUpperCase(),
      password: originalPassword,
      ip: `integration-${randomUUID()}`,
    });
    const stored = await pool.query<{
      token_hash: Buffer;
      revoked_at: Date | null;
    }>(
      "SELECT token_hash, revoked_at FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    expect(stored.rows[0].token_hash.equals(Buffer.from(signedIn.token))).toBe(
      false,
    );
    expect(JSON.stringify(stored.rows[0])).not.toContain(signedIn.token);
    const credential = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM auth_accounts WHERE id = $1",
      [accountId],
    );
    expect(credential.rows[0].password_hash).not.toBe(originalPassword);
    expect(credential.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(await service.validateSession(signedIn.token)).toMatchObject({
      id: userId,
      role: "ADMIN",
    });
    await service.signOut(signedIn.token);
    expect(await service.validateSession(signedIn.token)).toBeNull();
  });

  it("stores reset tokens hash-only, consumes once, revokes sessions, and replaces the password", async () => {
    const priorSession = await service.signIn({
      email,
      password: originalPassword,
      ip: `prior-${randomUUID()}`,
    });
    await service.forgotPassword({ email, ip: `forgot-${randomUUID()}` });
    const rawToken = new URL(mail.messages.at(-1)!.resetUrl).searchParams.get(
      "token",
    )!;
    const stored = await pool.query<{ token_hash: Buffer; expires_at: Date }>(
      "SELECT token_hash, expires_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    expect(JSON.stringify(stored.rows[0])).not.toContain(rawToken);
    expect(stored.rows[0].expires_at.getTime()).toBeGreaterThan(Date.now());
    await service.resetPassword({
      token: rawToken,
      newPassword: replacementPassword,
      ip: `reset-${randomUUID()}`,
    });
    expect(await service.validateSession(priorSession.token)).toBeNull();
    await expect(
      service.resetPassword({
        token: rawToken,
        newPassword: "unused replacement password",
        ip: `replay-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
    await expect(
      service.signIn({
        email,
        password: originalPassword,
        ip: `old-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      service.signIn({
        email,
        password: replacementPassword,
        ip: `new-${randomUUID()}`,
      }),
    ).resolves.toBeTruthy();
  });
});
