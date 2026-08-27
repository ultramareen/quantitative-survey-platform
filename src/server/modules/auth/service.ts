import "server-only";

import {
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_FORGOT_MESSAGE,
  GENERIC_RESET_ERROR,
  PASSWORD_RESET_MILLISECONDS,
  SESSION_ABSOLUTE_MILLISECONDS,
  SESSION_IDLE_MILLISECONDS,
} from "./constants";
import { AppError } from "@/server/errors/app-error";
import { writeStructuredLog } from "@/server/logging/logger";
import {
  generateSecureToken,
  hashPassword,
  hashSecureToken,
  verifyPassword,
} from "@/server/modules/cryptography";
import type { AuthMailAdapter } from "./mail";
import { normalizeEmployeeEmail } from "./normalize-email";
import type { AuthRateLimiter } from "./rate-limit";
import type { AuthRepository } from "./repository";
import { requireAuthorizationVersion } from "./policies";
import type { EmployeePrincipal } from "./types";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$WjoQcK5jG3+Q3/cZQ3gGqzfFfVeRjUyKt+hXN04BkqY";

export class EmployeeAuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly mail: AuthMailAdapter,
    private readonly applicationOrigin: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async signIn(input: {
    email: string;
    password: string;
    ip: string;
  }): Promise<{ token: string; employee: EmployeePrincipal }> {
    const now = this.clock();
    const email = normalizeEmployeeEmail(input.email);
    await Promise.all([
      this.rateLimiter.consume("auth-login-email", email || "invalid", 5, now),
      this.rateLimiter.consume("auth-login-ip", input.ip, 20, now),
    ]);
    const credential = await this.repository.findCredential(email);
    const valid = await verifyPassword(
      credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    if (!credential || !valid || credential.disabledAt) {
      throw invalidCredentials();
    }

    const token = generateSecureToken();
    const absoluteExpiresAt = new Date(
      now.getTime() + SESSION_ABSOLUTE_MILLISECONDS,
    );
    await this.repository.createSession({
      userId: credential.id,
      tokenHash: hashSecureToken(token),
      authorizationVersion: credential.authorizationVersion,
      now,
      idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MILLISECONDS),
      absoluteExpiresAt,
    });
    return {
      token,
      employee: {
        id: credential.id,
        email: credential.email,
        displayName: credential.displayName,
        role: credential.role,
        authorizationVersion: credential.authorizationVersion,
      },
    };
  }

  async validateSession(
    token: string | undefined,
  ): Promise<EmployeePrincipal | null> {
    if (!token) return null;
    let hash: Buffer;
    try {
      hash = hashSecureToken(token);
    } catch {
      return null;
    }
    const session = await this.repository.findSession(hash);
    const now = this.clock();
    if (
      !session ||
      session.revokedAt ||
      session.disabledAt ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    ) {
      return null;
    }
    try {
      requireAuthorizationVersion(
        session.sessionAuthorizationVersion,
        session.authorizationVersion,
      );
    } catch {
      return null;
    }
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + SESSION_IDLE_MILLISECONDS,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.repository.touchSession(session.sessionId, now, idleExpiresAt);
    return {
      id: session.id,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      authorizationVersion: session.authorizationVersion,
    };
  }

  async signOut(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      await this.repository.revokeSession(hashSecureToken(token), this.clock());
    } catch {
      // Invalid/replayed cookies are cleared by the caller without disclosure.
    }
  }

  async forgotPassword(input: {
    email: string;
    ip: string;
  }): Promise<{ message: string }> {
    const now = this.clock();
    const email = normalizeEmployeeEmail(input.email);
    await Promise.all([
      this.rateLimiter.consume("auth-forgot-email", email || "invalid", 3, now),
      this.rateLimiter.consume("auth-forgot-ip", input.ip, 10, now),
    ]);
    const credential = await this.repository.findCredential(email);
    if (credential && !credential.disabledAt) {
      const token = generateSecureToken();
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_MILLISECONDS);
      await this.repository.createPasswordReset({
        userId: credential.id,
        tokenHash: hashSecureToken(token),
        expiresAt,
        now,
      });
      const resetUrl = new URL("/reset-password", this.applicationOrigin);
      resetUrl.searchParams.set("token", token);
      try {
        await this.mail.sendPasswordReset({
          recipient: credential.email,
          resetUrl: resetUrl.toString(),
          expiresAt,
        });
      } catch {
        writeStructuredLog("error", "password_reset_delivery_failed");
      }
    }
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  async resetPassword(input: {
    token: string;
    newPassword: string;
    ip: string;
  }): Promise<void> {
    const now = this.clock();
    await this.rateLimiter.consume("auth-reset-ip", input.ip, 10, now);
    let tokenHash: Buffer;
    try {
      tokenHash = hashSecureToken(input.token);
    } catch {
      throw invalidReset();
    }
    const passwordHash = await hashPassword(input.newPassword);
    const consumed = await this.repository.consumePasswordReset({
      tokenHash,
      passwordHash,
      now,
    });
    if (!consumed) throw invalidReset();
  }
}

function invalidCredentials() {
  return new AppError({
    category: "AUTHENTICATION",
    code: "INVALID_CREDENTIALS",
    message: GENERIC_CREDENTIALS_MESSAGE,
    safeMessage: GENERIC_CREDENTIALS_MESSAGE,
    status: 401,
  });
}

function invalidReset() {
  return new AppError({
    category: "AUTHENTICATION",
    code: "INVALID_PASSWORD_RESET",
    message: GENERIC_RESET_ERROR,
    safeMessage: GENERIC_RESET_ERROR,
    status: 400,
  });
}
