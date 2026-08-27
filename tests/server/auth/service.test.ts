import { describe, expect, it } from "vitest";

import { hashPassword, hashSecureToken } from "@/server/modules/cryptography";
import type {
  AuthMailAdapter,
  PasswordResetMail,
} from "@/server/modules/auth/mail";
import { AuthRateLimiter } from "@/server/modules/auth/rate-limit";
import type { AuthRepository } from "@/server/modules/auth/repository";
import { EmployeeAuthService } from "@/server/modules/auth/service";
import type {
  EmployeePrincipal,
  SessionRecord,
} from "@/server/modules/auth/types";

class FakeRepository implements AuthRepository {
  credential:
    | (EmployeePrincipal & { passwordHash: string; disabledAt: Date | null })
    | null = null;
  sessions = new Map<string, SessionRecord>();
  resets = new Map<
    string,
    { userId: string; expiresAt: Date; usedAt: Date | null }
  >();
  rate = new Map<string, number>();
  lastRawToken = "";

  async findCredential(email: string) {
    return this.credential?.email === email ? this.credential : null;
  }
  async createSession(input: {
    userId: string;
    tokenHash: Buffer;
    authorizationVersion: number;
    now: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }) {
    const key = input.tokenHash.toString("hex");
    const credential = this.credential!;
    this.sessions.set(key, {
      ...credential,
      sessionId: `session-${this.sessions.size + 1}`,
      sessionAuthorizationVersion: input.authorizationVersion,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    });
  }
  async findSession(hash: Buffer) {
    return this.sessions.get(hash.toString("hex")) ?? null;
  }
  async touchSession(id: string, seen: Date, idle: Date) {
    for (const [key, session] of this.sessions)
      if (session.sessionId === id)
        this.sessions.set(key, { ...session, idleExpiresAt: idle });
    void seen;
  }
  async revokeSession(hash: Buffer, now: Date) {
    const key = hash.toString("hex");
    const session = this.sessions.get(key);
    if (session) this.sessions.set(key, { ...session, revokedAt: now });
  }
  async createPasswordReset(input: {
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    now: Date;
  }) {
    for (const reset of this.resets.values())
      if (reset.userId === input.userId && !reset.usedAt)
        reset.usedAt = input.now;
    this.resets.set(input.tokenHash.toString("hex"), {
      userId: input.userId,
      expiresAt: input.expiresAt,
      usedAt: null,
    });
  }
  async consumePasswordReset(input: {
    tokenHash: Buffer;
    passwordHash: string;
    now: Date;
  }) {
    const reset = this.resets.get(input.tokenHash.toString("hex"));
    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt <= input.now ||
      this.credential?.disabledAt
    )
      return false;
    for (const item of this.resets.values())
      if (item.userId === reset.userId) item.usedAt ??= input.now;
    this.credential = { ...this.credential!, passwordHash: input.passwordHash };
    for (const [key, session] of this.sessions)
      this.sessions.set(key, { ...session, revokedAt: input.now });
    return true;
  }
  async incrementRateLimit(input: {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
  }) {
    const key = `${input.scope}:${input.subjectHash.toString("hex")}:${input.windowStart.toISOString()}`;
    const count = (this.rate.get(key) ?? 0) + 1;
    this.rate.set(key, count);
    return count;
  }
}

class FakeMail implements AuthMailAdapter {
  messages: PasswordResetMail[] = [];
  async sendPasswordReset(message: PasswordResetMail) {
    this.messages.push(message);
  }
}

async function fixture() {
  const repository = new FakeRepository();
  repository.credential = {
    id: "employee-1",
    email: "admin@synthetic.invalid",
    displayName: "Synthetic Admin",
    role: "ADMIN",
    authorizationVersion: 1,
    disabledAt: null,
    passwordHash: await hashPassword("valid synthetic password"),
  };
  const mail = new FakeMail();
  let now = new Date("2026-08-27T12:00:00.000Z");
  const service = new EmployeeAuthService(
    repository,
    new AuthRateLimiter(repository, Buffer.alloc(32, 77)),
    mail,
    "https://survey.example.com",
    () => now,
  );
  return {
    repository,
    mail,
    service,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

describe("employee authentication service", () => {
  it("normalizes email, authenticates, stores only a token hash, and prevents fixation", async () => {
    const { repository, service } = await fixture();
    const first = await service.signIn({
      email: " ADMIN@Synthetic.Invalid ",
      password: "valid synthetic password",
      ip: "127.0.0.1",
    });
    const second = await service.signIn({
      email: "admin@synthetic.invalid",
      password: "valid synthetic password",
      ip: "127.0.0.1",
    });
    expect(first.token).not.toBe(second.token);
    expect(
      repository.sessions.has(hashSecureToken(first.token).toString("hex")),
    ).toBe(true);
    expect(JSON.stringify([...repository.sessions.keys()])).not.toContain(
      first.token,
    );
  });

  it("returns the same generic denial for unknown, wrong-password, and disabled accounts", async () => {
    const { repository, service } = await fixture();
    for (const attempt of [
      { email: "missing@synthetic.invalid", password: "wrong" },
      { email: "admin@synthetic.invalid", password: "wrong" },
    ])
      await expect(
        service.signIn({ ...attempt, ip: crypto.randomUUID() }),
      ).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        safeMessage: "Invalid email or password.",
      });
    repository.credential!.disabledAt = new Date();
    await expect(
      service.signIn({
        email: repository.credential!.email,
        password: "valid synthetic password",
        ip: "disabled",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      safeMessage: "Invalid email or password.",
    });
  });

  it("enforces idle, absolute, revoked, disabled, and authorization-version session validity", async () => {
    const { repository, service, advance } = await fixture();
    const signedIn = await service.signIn({
      email: repository.credential!.email,
      password: "valid synthetic password",
      ip: "session",
    });
    expect(await service.validateSession(signedIn.token)).toMatchObject({
      role: "ADMIN",
    });
    const key = hashSecureToken(signedIn.token).toString("hex");
    repository.sessions.get(key)!.sessionAuthorizationVersion = 0;
    expect(await service.validateSession(signedIn.token)).toBeNull();
    repository.sessions.get(key)!.sessionAuthorizationVersion = 1;
    advance(8 * 24 * 60 * 60 * 1000);
    expect(await service.validateSession(signedIn.token)).toBeNull();

    const idleFixture = await fixture();
    const idle = await idleFixture.service.signIn({
      email: idleFixture.repository.credential!.email,
      password: "valid synthetic password",
      ip: "idle",
    });
    idleFixture.advance(8 * 60 * 60 * 1000 + 1);
    expect(await idleFixture.service.validateSession(idle.token)).toBeNull();

    const disabledFixture = await fixture();
    const disabled = await disabledFixture.service.signIn({
      email: disabledFixture.repository.credential!.email,
      password: "valid synthetic password",
      ip: "disabled-session",
    });
    disabledFixture.repository.sessions.get(
      hashSecureToken(disabled.token).toString("hex"),
    )!.disabledAt = new Date();
    expect(
      await disabledFixture.service.validateSession(disabled.token),
    ).toBeNull();
  });

  it("does not reveal an eligible account when reset delivery fails", async () => {
    const { repository, mail, service } = await fixture();
    const errorOutput: string[] = [];
    const originalConsoleError = console.error;
    console.error = (message) => errorOutput.push(String(message));
    mail.sendPasswordReset = async (message) => {
      mail.messages.push(message);
      throw new Error("synthetic delivery failure");
    };
    try {
      await expect(
        service.forgotPassword({
          email: repository.credential!.email,
          ip: "mail-failure",
        }),
      ).resolves.toMatchObject({
        message: expect.stringContaining("If an eligible account"),
      });
    } finally {
      console.error = originalConsoleError;
    }
    const rawToken = new URL(mail.messages[0].resetUrl).searchParams.get(
      "token",
    )!;
    expect(errorOutput.join(" ")).toContain("password_reset_delivery_failed");
    expect(errorOutput.join(" ")).not.toContain(rawToken);
    expect(errorOutput.join(" ")).not.toContain(repository.credential!.email);
  });

  it("revokes the current session on logout and rejects replay", async () => {
    const { repository, service } = await fixture();
    const result = await service.signIn({
      email: repository.credential!.email,
      password: "valid synthetic password",
      ip: "logout",
    });
    await service.signOut(result.token);
    expect(await service.validateSession(result.token)).toBeNull();
    await expect(service.signOut(result.token)).resolves.toBeUndefined();
  });

  it("uses generic forgot responses and single-use, expiring reset tokens", async () => {
    const { repository, mail, service, advance } = await fixture();
    const unknown = await service.forgotPassword({
      email: "missing@synthetic.invalid",
      ip: "forgot-unknown",
    });
    const known = await service.forgotPassword({
      email: repository.credential!.email,
      ip: "forgot-known",
    });
    expect(unknown).toEqual(known);
    expect(mail.messages).toHaveLength(1);
    const token = new URL(mail.messages[0].resetUrl).searchParams.get("token")!;
    await service.forgotPassword({
      email: repository.credential!.email,
      ip: "forgot-replacement",
    });
    const replacementToken = new URL(
      mail.messages.at(-1)!.resetUrl,
    ).searchParams.get("token")!;
    await expect(
      service.resetPassword({
        token,
        newPassword: "superseded synthetic password",
        ip: "reset-superseded",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
    const oldSession = await service.signIn({
      email: repository.credential!.email,
      password: "valid synthetic password",
      ip: "before-reset",
    });
    await service.resetPassword({
      token: replacementToken,
      newPassword: "replacement synthetic password",
      ip: "reset",
    });
    expect(await service.validateSession(oldSession.token)).toBeNull();
    await expect(
      service.resetPassword({
        token: replacementToken,
        newPassword: "another synthetic password",
        ip: "reset-replay",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
    await expect(
      service.resetPassword({
        token: "malformed",
        newPassword: "another synthetic password",
        ip: "reset-malformed",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
    await expect(
      service.signIn({
        email: repository.credential!.email,
        password: "valid synthetic password",
        ip: "old-password",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      service.signIn({
        email: repository.credential!.email,
        password: "replacement synthetic password",
        ip: "new-password",
      }),
    ).resolves.toBeTruthy();
    await service.forgotPassword({
      email: repository.credential!.email,
      ip: "forgot-expiry",
    });
    const expiringToken = new URL(
      mail.messages.at(-1)!.resetUrl,
    ).searchParams.get("token")!;
    advance(31 * 60 * 1000);
    await expect(
      service.resetPassword({
        token: expiringToken,
        newPassword: "expired synthetic password",
        ip: "expired",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
  });

  it("persists and enforces login rate limits without raw subjects", async () => {
    const { repository, service } = await fixture();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.signIn({
        email: repository.credential!.email,
        password: "valid synthetic password",
        ip: "rate-ip",
      });
    }
    await expect(
      service.signIn({
        email: repository.credential!.email,
        password: "valid synthetic password",
        ip: "rate-ip",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect([...repository.rate.keys()].join(" ")).not.toContain(
      repository.credential!.email,
    );
  });

  it("rate limits forgot-password and reset attempts with hashed subjects", async () => {
    const { repository, service } = await fixture();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.forgotPassword({
        email: "missing@synthetic.invalid",
        ip: `forgot-ip-${attempt}`,
      });
    }
    await expect(
      service.forgotPassword({
        email: "missing@synthetic.invalid",
        ip: "forgot-ip-limited",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        service.resetPassword({
          token: "malformed",
          newPassword: "synthetic replacement",
          ip: "reset-rate-ip",
        }),
      ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET" });
    }
    await expect(
      service.resetPassword({
        token: "malformed",
        newPassword: "synthetic replacement",
        ip: "reset-rate-ip",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    expect([...repository.rate.keys()].join(" ")).not.toContain(
      "missing@synthetic.invalid",
    );
    expect([...repository.rate.keys()].join(" ")).not.toContain(
      "reset-rate-ip",
    );
  });
});
