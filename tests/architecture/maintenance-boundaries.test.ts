import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("maintenance boundaries", () => {
  it("does not expose backup, restore, or key rotation through request routes", async () => {
    const tracked = await import("node:child_process").then(
      ({ execFileSync }) =>
        execFileSync("git", ["ls-files", "src/app"], { encoding: "utf8" })
          .trim()
          .split("\n")
          .filter(Boolean),
    );
    const contents = await Promise.all(
      tracked.map((file) => readFile(resolve(file), "utf8")),
    );
    expect(contents.join("\n")).not.toMatch(
      /backup-archive|restore-verifier|PgReencryptionMaintenanceService|rotate-pii-key/,
    );
  });
});
