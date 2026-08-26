import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("frozen source-of-truth documents", () => {
  it("matches the reviewed byte-level baseline", async () => {
    const manifest = await readFile(join(root, ".frozen-docs.sha256"), "utf8");
    const entries = manifest.trim().split("\n");

    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const match = entry.match(/^([a-f0-9]{64})\s{2}(.+)$/);
      expect(match).not.toBeNull();
      const [, expectedHash, relativePath] = match!;
      const contents = await readFile(join(root, relativePath));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  it("excludes docs from formatter and linter fix scope", async () => {
    const prettierIgnore = await readFile(
      join(root, ".prettierignore"),
      "utf8",
    );
    const eslintConfig = await readFile(
      join(root, "eslint.config.mjs"),
      "utf8",
    );
    const packageJson = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };

    expect(prettierIgnore.split("\n")).toContain("docs/");
    expect(eslintConfig).toContain('"docs/**"');
    for (const script of [
      "format",
      "format:check",
      "lint",
      "lint:fix",
      "verify",
    ]) {
      expect(packageJson.scripts[script]).toContain("check-frozen-docs.mjs");
    }
    expect(packageJson.scripts["lint:fix"]).toContain(
      "--ignore-pattern 'docs/**'",
    );
  });
});
