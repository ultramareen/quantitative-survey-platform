import "server-only";

import { AppError } from "@/server/errors/app-error";
import { createRateLimitHmac } from "@/server/modules/cryptography";
import type { AuthRepository } from "./repository";

const WINDOW_MILLISECONDS = 15 * 60 * 1000;

export class AuthRateLimiter {
  constructor(
    private readonly repository: AuthRepository,
    private readonly hmacKey: Buffer,
  ) {}

  async consume(
    scope: string,
    normalizedSubject: string,
    limit: number,
    now: Date,
  ): Promise<void> {
    const windowStart = new Date(
      Math.floor(now.getTime() / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS,
    );
    const count = await this.repository.incrementRateLimit({
      scope,
      subjectHash: createRateLimitHmac(scope, normalizedSubject, this.hmacKey),
      windowStart,
      expiresAt: new Date(windowStart.getTime() + WINDOW_MILLISECONDS * 2),
    });
    if (count > limit) {
      throw new AppError({
        category: "RATE_LIMIT",
        code: "RATE_LIMITED",
        message: `Rate limit exceeded for ${scope}.`,
        safeMessage: "Too many requests. Please try again later.",
        status: 429,
      });
    }
  }
}

export function normalizeRateLimitIp(value: string | null): string {
  const candidate = (value?.split(",")[0] ?? "unknown").trim().toLowerCase();
  return candidate.slice(0, 128) || "unknown";
}
