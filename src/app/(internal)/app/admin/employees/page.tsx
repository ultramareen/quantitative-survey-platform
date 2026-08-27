import { redirect } from "next/navigation";
import { EmployeeManagement } from "@/components/admin/employee-management";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

export const dynamic = "force-dynamic";
export default async function EmployeesPage() {
  const actor = await getCurrentEmployee();
  let rows;
  try {
    rows = await getEmployeeManagementService().list(actor);
  } catch {
    redirect("/app?error=forbidden");
  }
  return (
    <section>
      <p className="text-sm font-medium tracking-wide text-blue-700 uppercase">
        Administration
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Employees and invitations</h1>
      <p className="mt-3 text-slate-600">
        Invite employees, assign roles, and manage account access. Invitations
        expire after 72 hours.
      </p>
      <EmployeeManagement rows={rows} />
    </section>
  );
}
