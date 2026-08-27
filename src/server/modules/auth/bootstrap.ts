import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { getDatabasePool } from "@/server/database/pool";
import { hashPassword } from "@/server/modules/cryptography";
import { normalizeEmployeeEmail } from "./normalize-email";

export async function bootstrapInitialAdmin(
  input: { email: string; displayName: string; password: string },
  pool: Pool = getDatabasePool(),
): Promise<{ userId: string }> {
  const email = normalizeEmployeeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email.includes("@") || !displayName || input.password.length < 12) {
    throw new Error("Bootstrap input is invalid.");
  }
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const count = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM users",
    );
    if (count.rows[0]?.count !== "0") {
      throw new Error(
        "Initial administrator bootstrap is no longer available.",
      );
    }
    const userId = randomUUID();
    const now = new Date();
    await client.query(
      `INSERT INTO users
        (id, email_normalized, display_name, email_verified, role,
         authorization_version, created_at, updated_at)
       VALUES ($1, $2, $3, true, 'ADMIN', 1, $4, $4)`,
      [userId, email, displayName, now],
    );
    await client.query(
      `INSERT INTO auth_accounts
        (id, user_id, issuer, provider_id, account_id, password_hash,
         created_at, updated_at)
       VALUES ($1, $2, 'local', 'credential', $3, $4, $5, $5)`,
      [randomUUID(), userId, email, passwordHash, now],
    );
    await client.query(
      `INSERT INTO audit_events
       (id, actor_user_id, action, target_type, target_id, result,
         affected_rows, safe_metadata, created_at)
       VALUES ($1, $2, 'INITIAL_ADMIN_BOOTSTRAPPED', 'User', $3, 'SUCCESS',
               1, $4, $5)`,
      [
        randomUUID(),
        userId,
        userId,
        JSON.stringify({ method: "server-cli" }),
        now,
      ],
    );
    await client.query("COMMIT");
    return { userId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
