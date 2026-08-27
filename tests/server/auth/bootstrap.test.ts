import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { bootstrapInitialAdmin } from "@/server/modules/auth/bootstrap";

function fakePool(userCount: string) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text.includes("SELECT count(*)"))
        return { rows: [{ count: userCount }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool,
    client,
    queries,
  };
}

describe("one-time initial Admin bootstrap", () => {
  it("creates exactly one Admin credential and a safe audit event from server input", async () => {
    const fake = fakePool("0");
    const result = await bootstrapInitialAdmin(
      {
        email: " INITIAL.ADMIN@Synthetic.Invalid ",
        displayName: "Initial Admin",
        password: "synthetic bootstrap password",
      },
      fake.pool,
    );
    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    const sql = fake.queries.map(({ text }) => text).join("\n");
    expect(sql).toContain("'ADMIN'");
    expect(sql).toContain("INITIAL_ADMIN_BOOTSTRAPPED");
    expect(JSON.stringify(fake.queries.map(({ values }) => values))).toContain(
      "server-cli",
    );
    expect(sql).not.toContain("synthetic bootstrap password");
    expect(fake.queries.at(-1)?.text).toBe("COMMIT");
  });

  it("cannot be reused after any user exists", async () => {
    const fake = fakePool("1");
    await expect(
      bootstrapInitialAdmin(
        {
          email: "another.admin@synthetic.invalid",
          displayName: "Another Admin",
          password: "another synthetic password",
        },
        fake.pool,
      ),
    ).rejects.toThrow("no longer available");
    expect(
      fake.queries.some(({ text }) => text.includes("INSERT INTO users")),
    ).toBe(false);
    expect(fake.queries.at(-1)?.text).toBe("ROLLBACK");
  });
});
