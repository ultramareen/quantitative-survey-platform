import Link from "next/link";

import { PublicShell } from "@/components/layout/public-shell";

export default function NotFound() {
  return (
    <PublicShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-blue-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-slate-600">
          The requested page is unavailable.
        </p>
        <Link
          className="mt-6 inline-block font-medium text-blue-700 underline"
          href="/"
        >
          Return home
        </Link>
      </section>
    </PublicShell>
  );
}
