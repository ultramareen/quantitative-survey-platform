import { describe, expect, it } from "vitest";

import {
  requireAuthenticated,
  requireAuthorizationVersion,
  requirePiiAccess,
  requireRole,
  requireSurveyOwner,
  requireSurveyTombstone,
} from "@/server/modules/auth/policies";
import type {
  EmployeePrincipal,
  EmployeeRole,
} from "@/server/modules/auth/types";

function principal(role: EmployeeRole, id: string = role): EmployeePrincipal {
  return {
    id,
    email: `${role.toLowerCase()}@synthetic.invalid`,
    displayName: role,
    role,
    authorizationVersion: 2,
  };
}

describe("central employee authorization policies", () => {
  it.each([
    {
      role: "PRODUCT_MANAGER" as const,
      pii: false,
      admin: false,
    },
    { role: "RESEARCHER" as const, pii: true, admin: false },
    { role: "ADMIN" as const, pii: true, admin: true },
  ])(
    "enforces the direct authenticated/PII/Admin matrix for $role",
    ({ role, pii, admin }) => {
      const employee = principal(role);
      expect(requireAuthenticated(employee)).toBe(employee);

      if (pii) expect(requirePiiAccess(employee)).toBe(employee);
      else expect(() => requirePiiAccess(employee)).toThrow("Role");

      if (admin) expect(requireRole(employee, ["ADMIN"])).toBe(employee);
      else expect(() => requireRole(employee, ["ADMIN"])).toThrow("Role");
    },
  );

  it("requires authentication and exact allowed roles", () => {
    expect(() => requireAuthenticated(null)).toThrow("Authentication");
    expect(requireRole(principal("ADMIN"), ["ADMIN"]).role).toBe("ADMIN");
    expect(() => requireRole(principal("RESEARCHER"), ["ADMIN"])).toThrow(
      "Role",
    );
  });

  it("allows the owner or Admin through the ownership placeholder", () => {
    expect(
      requireSurveyOwner(principal("PRODUCT_MANAGER", "owner"), "owner"),
    ).toBeTruthy();
    expect(
      requireSurveyOwner(principal("ADMIN", "admin"), "owner"),
    ).toBeTruthy();
    expect(() =>
      requireSurveyOwner(principal("RESEARCHER", "other"), "owner"),
    ).toThrow("ownership");
  });

  it("limits PII to Researcher/Admin and tombstones to Admin", () => {
    expect(requirePiiAccess(principal("RESEARCHER"))).toBeTruthy();
    expect(requirePiiAccess(principal("ADMIN"))).toBeTruthy();
    expect(() => requirePiiAccess(principal("PRODUCT_MANAGER"))).toThrow();
    expect(requireSurveyTombstone(principal("ADMIN"))).toBeTruthy();
    expect(() => requireSurveyTombstone(principal("RESEARCHER"))).toThrow();
  });

  it("rejects stale authorization versions", () => {
    expect(() => requireAuthorizationVersion(2, 2)).not.toThrow();
    expect(() => requireAuthorizationVersion(1, 2)).toThrow("stale");
  });
});
