export type { EmployeePrincipal, EmployeeRole } from "@/types/employee";

import type { EmployeePrincipal } from "@/types/employee";

export type SessionRecord = EmployeePrincipal & {
  sessionId: string;
  sessionAuthorizationVersion: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  disabledAt: Date | null;
};
