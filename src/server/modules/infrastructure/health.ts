import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

export class ProductionHealthService {
  constructor(private readonly pool: Pool) {}

  async ready(): Promise<boolean> {
    try {
      const result = await this.pool.query("SELECT TRUE AS ready");
      return result.rows[0]?.ready === true;
    } catch {
      return false;
    }
  }
}

export function authorizeSmokeCheck(
  authorization: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedHash = createHash("sha256").update(expectedToken).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}
