import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("security header baseline", () => {
  it("defines CSP and browser hardening headers centrally", async () => {
    const config = await readFile(
      join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    for (const header of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "X-DNS-Prefetch-Control",
    ]) {
      expect(config).toContain(header);
    }
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("productionBrowserSourceMaps: false");
  });
});
