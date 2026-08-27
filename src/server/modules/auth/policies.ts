import "server-only";

import { AppError } from "@/server/errors/app-error";
import type { EmployeePrincipal, EmployeeRole } from "./types";

export function requireAuthenticated(
  principal: EmployeePrincipal | null,
): EmployeePrincipal {
  if (!principal) throw denied("Authentication is required.", 401);
  return principal;
}

export function requireRole(
  principal: EmployeePrincipal | null,
  allowed: readonly EmployeeRole[],
): EmployeePrincipal {
  const employee = requireAuthenticated(principal);
  if (!allowed.includes(employee.role)) throw denied("Role is not authorized.");
  return employee;
}

export function requireSurveyOwner(
  principal: EmployeePrincipal | null,
  ownerId: string,
): EmployeePrincipal {
  const employee = requireAuthenticated(principal);
  if (employee.role !== "ADMIN" && employee.id !== ownerId) {
    throw denied("Survey ownership is required.");
  }
  return employee;
}

export function requirePiiAccess(
  principal: EmployeePrincipal | null,
): EmployeePrincipal {
  return requireRole(principal, ["RESEARCHER", "ADMIN"]);
}

export function requireSurveyTombstone(
  principal: EmployeePrincipal | null,
): EmployeePrincipal {
  return requireRole(principal, ["ADMIN"]);
}

export function requireAuthorizationVersion(
  sessionVersion: number,
  currentVersion: number,
): void {
  if (sessionVersion !== currentVersion) {
    throw denied("Authorization version is stale.", 401);
  }
}

function denied(message: string, status = 403): AppError {
  return new AppError({
    category: status === 401 ? "AUTHENTICATION" : "AUTHORIZATION",
    code: status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN",
    message,
    safeMessage:
      status === 401 ? "Authentication is required." : "Access is denied.",
    status,
  });
}
