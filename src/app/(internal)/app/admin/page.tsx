import { StatusBadge } from "@/components/ui/status-badge";
import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { requireRole } from "@/server/modules/auth/policies";

export default async function AdminFoundationPage() {
  const employee = await getCurrentEmployee();
  try {
    requireRole(employee, ["ADMIN"]);
  } catch {
    redirect("/app?error=forbidden");
  }
  return (
    <section aria-labelledby="admin-heading">
      <StatusBadge label="Admin authorized" tone="warning" />
      <h1
        id="admin-heading"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        Administration shell
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        Server-side authorization confirmed the Admin role. Employee and
        infrastructure controls remain reserved for later approved phases.
      </p>
    </section>
  );
}
