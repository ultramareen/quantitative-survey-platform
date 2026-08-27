import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = join(root, "scripts", "check-env.ts");

describe("startup configuration gate", () => {
  it("exits safely before startup when required configuration is absent", () => {
    let output = "";

    try {
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", script],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            APP_ENV: "test",
            APP_ORIGIN: "http://localhost:3000",
            DATABASE_URL:
              "postgresql://synthetic:synthetic@localhost:26257/test",
            BETTER_AUTH_SECRET: "short",
          },
          stdio: "pipe",
        },
      );
    } catch (error) {
      const failure = error as {
        stdout?: string;
        stderr?: string;
        status?: number;
      };
      output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
      expect(failure.status).toBe(1);
    }

    expect(output).toContain("BETTER_AUTH_SECRET");
    expect(output).not.toContain("short");
  });
});
