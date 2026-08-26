import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoot = join(root, "src");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry);
      return (await stat(path)).isDirectory()
        ? sourceFiles(path)
        : /\.[cm]?[jt]sx?$/.test(path)
          ? [path]
          : [];
    }),
  );
  return nested.flat();
}

describe("module boundaries", () => {
  it("defines every approved backend module boundary", async () => {
    const expected = [
      "attempts",
      "audit",
      "auth",
      "cryptography",
      "employees",
      "exports",
      "infrastructure",
      "respondents",
      "results",
      "surveys",
    ];
    expect(
      (await readdir(join(sourceRoot, "server", "modules"))).sort(),
    ).toEqual(expected);
  });

  it("keeps server imports out of client components and client-safe UI", async () => {
    const files = await sourceFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      const isClientModule =
        content.trimStart().startsWith('"use client"') ||
        file.includes(`${join("src", "components")}`);
      if (
        isClientModule &&
        /(?:@\/server|@prisma\/client|from ["']prisma)/.test(content)
      ) {
        violations.push(relative(root, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it("marks sensitive server entry points as server-only", async () => {
    const sensitiveEntryPoints = [
      "src/server/config/env.ts",
      "src/server/database/transaction.ts",
      "src/server/http/csrf.ts",
      "src/server/http/cookies.ts",
      "src/server/http/request-validation.ts",
      "src/server/logging/logger.ts",
    ];

    for (const path of sensitiveEntryPoints) {
      await expect(readFile(join(root, path), "utf8")).resolves.toContain(
        'import "server-only"',
      );
    }
  });

  it("does not expose secret-shaped names through NEXT_PUBLIC variables", async () => {
    const files = await sourceFiles(sourceRoot);
    const violations: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (
        /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY|DATABASE)/.test(
          content,
        )
      ) {
        violations.push(relative(root, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("configures CockroachDB without Phase 1 models or migrations", async () => {
    const schema = await readFile(
      join(root, "prisma", "schema.prisma"),
      "utf8",
    );
    expect(schema).toContain('provider = "cockroachdb"');
    expect(schema).not.toMatch(/^model\s/m);
    await expect(stat(join(root, "prisma", "migrations"))).rejects.toThrow();
  });
});
