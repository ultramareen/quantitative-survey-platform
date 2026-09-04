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

  it("lets the shared primary variant own the yellow button foreground", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");
    expect(styles).toMatch(
      /@layer base\s*{[\s\S]*button\s*{\s*color: var\(--foreground\);\s*}/,
    );
    expect(styles).toMatch(
      /\.ui-primary\s*{[^}]*background: var\(--accent\);[^}]*color: var\(--accent-foreground\);/s,
    );
  });

  it("defines an isolated light respondent design system", () => {
    const styles = readFileSync("src/app/globals.css", "utf8");
    const respondentTheme = styles.slice(styles.indexOf(".respondent-theme"));
    expect(respondentTheme).toContain("--background: #ffffff");
    expect(respondentTheme).toContain("--foreground: #171717");
    expect(respondentTheme).toContain("--accent: var(--success)");
    expect(respondentTheme).toContain("color-scheme: light");
    expect(respondentTheme).toContain(".respondent-question");
    expect(respondentTheme).toContain(".respondent-question-heading");
    expect(respondentTheme).toContain(".respondent-choice-control");
    expect(respondentTheme).toMatch(
      /\.respondent-choice-control\s*{[^}]*border: 1px solid var\(--border\);[^}]*background: #ffffff;/s,
    );
    expect(respondentTheme).toContain(
      '.respondent-choice-control[type="radio"]:checked',
    );
    expect(respondentTheme).toContain(
      "radial-gradient(circle, #171717 0 40%, #ffffff 43%)",
    );
    expect(respondentTheme).toContain(
      '.respondent-choice-control[type="checkbox"]:checked',
    );
    expect(respondentTheme).toContain("background-color: #171717");
    expect(respondentTheme).toContain("stroke='white'");
    expect(respondentTheme).toMatch(
      /\.respondent-choice-control:focus-visible\s*{\s*outline-color: #171717;/,
    );
  });

  it("keeps quota and capacity concepts out of the ordinary Admin UI", () => {
    const adminPage = readFileSync(
      "src/app/(internal)/app/admin/page.tsx",
      "utf8",
    );
    const employeesPage = readFileSync(
      "src/app/(internal)/app/admin/employees/page.tsx",
      "utf8",
    );
    const appLayout = readFileSync("src/app/(internal)/app/layout.tsx", "utf8");
    expect(adminPage).toContain('redirect("/app/admin/employees")');
    expect(employeesPage).toContain("EmployeeManagement");
    expect(adminPage).not.toMatch(/quota|capacity|infrastructure/i);
    expect(employeesPage).not.toMatch(/quota|capacity|infrastructure/i);
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
