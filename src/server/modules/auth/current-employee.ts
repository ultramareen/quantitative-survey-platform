import "server-only";

import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME } from "./constants";
import { getEmployeeAuthService } from "./runtime";
import type { EmployeePrincipal } from "./types";

export async function getCurrentEmployee(): Promise<EmployeePrincipal | null> {
  const cookieStore = await cookies();
  return getEmployeeAuthService().validateSession(
    cookieStore.get(AUTH_COOKIE_NAME)?.value,
  );
}
