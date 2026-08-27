export const EMPLOYEE_ROLES = [
  "ADMIN",
  "PRODUCT_MANAGER",
  "RESEARCHER",
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export type EmployeePrincipal = {
  id: string;
  email: string;
  displayName: string;
  role: EmployeeRole;
  authorizationVersion: number;
};
