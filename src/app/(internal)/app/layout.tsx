import { InternalShell } from "@/components/layout/internal-shell";
import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/server/modules/auth/current-employee";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/sign-in?reason=session-required");
  return <InternalShell employee={employee}>{children}</InternalShell>;
}
