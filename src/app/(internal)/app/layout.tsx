import { InternalShell } from "@/components/layout/internal-shell";
import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";
import { InfrastructureUsageHeadline } from "@/components/infrastructure/usage-headline";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/sign-in");
  const usage = await getInfrastructureService().headline(employee);
  return (
    <InternalShell employee={employee}>
      <InfrastructureUsageHeadline value={usage} />
      {children}
    </InternalShell>
  );
}
