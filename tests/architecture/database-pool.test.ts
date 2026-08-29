import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("production database pool", () => {
  it("bounds dependency connection acquisition", async () => {
    const source = await readFile(
      join(process.cwd(), "src/server/database/pool.ts"),
      "utf8",
    );
    expect(source).toContain("connectionTimeoutMillis: 3_000");
  });
});
