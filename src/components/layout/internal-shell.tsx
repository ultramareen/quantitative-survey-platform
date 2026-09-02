"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import type { EmployeePrincipal } from "@/types/employee";

export function InternalShell({
  children,
  employee,
}: Readonly<{ children: React.ReactNode; employee: EmployeePrincipal }>) {
  const pathname = usePathname();
  const linkClass = (href: string) => {
    const active =
      href === "/app"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
    return `rounded-md px-3 py-2 text-sm ${
      active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"
    }`;
  };
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        className="sr-only z-50 rounded bg-white px-4 py-2 text-slate-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#main-content"
      >
        Skip to main content
      </a>
      <aside className="border-b border-slate-800 bg-slate-950 px-4 py-4 text-white lg:min-h-screen lg:border-r lg:border-b-0 lg:px-6 lg:py-8">
        <Link className="font-semibold tracking-tight" href="/app">
          Survey Platform
        </Link>
        <nav
          aria-label="Internal foundation navigation"
          className="mt-5 flex flex-wrap gap-2 lg:flex-col"
        >
          <Link
            aria-current={pathname === "/app" ? "page" : undefined}
            className={linkClass("/app")}
            href="/app"
          >
            Workspace
          </Link>
          <Link
            aria-current={
              pathname.startsWith("/app/surveys") ? "page" : undefined
            }
            className={linkClass("/app/surveys")}
            href="/app/surveys"
          >
            Surveys
          </Link>
          {employee.role === "RESEARCHER" || employee.role === "ADMIN" ? (
            <Link
              aria-current={
                pathname.startsWith("/app/respondents") ? "page" : undefined
              }
              className={linkClass("/app/respondents")}
              href="/app/respondents"
            >
              Respondents
            </Link>
          ) : null}
          {employee.role === "ADMIN" ? (
            <Link
              aria-current={
                pathname.startsWith("/app/admin") ? "page" : undefined
              }
              className={linkClass("/app/admin")}
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
      <main
        className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10"
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
