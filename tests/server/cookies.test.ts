import { describe, expect, it } from "vitest";

import { secureCookieOptions } from "@/server/http/cookies";

describe("secure cookie defaults", () => {
  it("uses HttpOnly, SameSite, and Secure in deployed environments", () => {
    expect(secureCookieOptions("production")).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });

  it("allows non-Secure cookies only for local/test operation", () => {
    expect(secureCookieOptions("development").secure).toBe(false);
    expect(secureCookieOptions("preview").secure).toBe(true);
  });
});
