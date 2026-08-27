import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import type { EmployeePrincipal } from "@/types/employee";

export function InternalShell({
  children,
  employee,
}: Readonly<{ children: React.ReactNode; employee: EmployeePrincipal }>) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-slate-800 bg-slate-950 px-4 py-4 text-white lg:min-h-screen lg:border-r lg:border-b-0 lg:px-6 lg:py-8">
        <Link className="font-semibold tracking-tight" href="/app">
          Survey Platform
        </Link>
        <nav
          aria-label="Internal foundation navigation"
          className="mt-5 flex gap-2 lg:flex-col"
        >
          <Link
            className="rounded-md bg-slate-800 px-3 py-2 text-sm"
            href="/app"
          >
            Workspace
          </Link>
          {employee.role === "ADMIN" ? (
            <Link
              className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              href="/app/admin"
            >
              Admin
            </Link>
          ) : null}
          <LogoutButton />
        </nav>
        <p className="mt-8 text-xs text-slate-400">
          {employee.displayName}
          <br />
          {employee.role.replaceAll("_", " ")}
        </p>
      </aside>
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        {children}
      </main>
    </div>
  );
}
