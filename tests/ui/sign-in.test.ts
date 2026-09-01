import { describe, expect, it } from "vitest";

import { getSignInNotice } from "@/components/auth/sign-in-notice";

describe("sign-in notices", () => {
  it("does not turn a normal authentication redirect into an expiry warning", () => {
    expect(getSignInNotice(undefined)).toBeUndefined();
    expect(getSignInNotice("session-required")).toBeUndefined();
  });

  it("preserves the successful password-reset notice", () => {
    expect(getSignInNotice("password-reset")).toMatch(/Password updated/);
  });
});
