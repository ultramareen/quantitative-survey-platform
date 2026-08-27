import type { EmployeeRole } from "@/types/employee";

export type InvitationStatus = "INVITED" | "REGISTERED" | "DISABLED";

export type EmployeeManagementRow = {
  invitationId: string | null;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: EmployeeRole;
  status: InvitationStatus | "ACTIVE";
  invitedAt: Date | null;
  tokenExpiresAt: Date | null;
  disabledAt: Date | null;
};

export type InvitationPreview = {
  email: string;
  expiresAt: Date;
  state: "VALID" | "EXPIRED" | "UNAVAILABLE";
};
