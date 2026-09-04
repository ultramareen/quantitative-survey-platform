import Link from "next/link";

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
      <p className="ui-kicker text-sm font-semibold tracking-wide uppercase">
        Administration
      </p>
      <h1
        id="admin-heading"
        className="mt-2 text-3xl font-semibold tracking-tight"
      >
        Manage your team
      </h1>
      <p className="ui-muted mt-3 max-w-2xl leading-7">
        Invite employees and manage their roles and access in one place.
      </p>
      <Link
        className="ui-primary mt-6 inline-block px-4 py-3"
        href="/app/admin/employees"
      >
        Manage employees
      </Link>
    </section>
  );
}
