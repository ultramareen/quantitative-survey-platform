import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 12 infrastructure UI", () => {
  it("defines the approved graphite and yellow design-system foundations", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");
    expect(styles).toContain("--background: #262626");
    expect(styles).toContain("--accent: #f5c242");
    expect(styles).toContain("--accent-foreground: #171717");
    expect(styles).toContain("accent-color: var(--accent)");
  });

  it("keeps quota and capacity concepts out of the ordinary Admin UI", () => {
    const adminPage = readFileSync(
      "src/app/(internal)/app/admin/page.tsx",
      "utf8",
    );
    const appLayout = readFileSync("src/app/(internal)/app/layout.tsx", "utf8");
    expect(adminPage).toContain("Manage employees");
    expect(adminPage).not.toMatch(/quota|capacity|infrastructure/i);
    expect(appLayout).not.toMatch(/usage|quota|infrastructure/i);
  });

  it("retains scheduled evaluation and transactional capacity enforcement", () => {
    const scheduledCheck = readFileSync(
      "netlify/functions/infrastructure-check.ts",
      "utf8",
    );
    const service = readFileSync(
      "src/server/modules/infrastructure/service.ts",
      "utf8",
    );
    expect(scheduledCheck).toContain("runCheck");
    expect(service).toContain("enforceCapacity");
    expect(service).toContain("95");
  });
});
