import Link from "next/link";

import { PublicShell } from "@/components/layout/public-shell";

export default function HomePage() {
  return (
    <PublicShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
          Phase 0 foundation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Quantitative Survey Platform
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Responsive public and internal application boundaries are ready.
          Product workflows begin only in their approved implementation phases.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="rounded-lg bg-blue-700 px-4 py-3 text-center font-medium text-white hover:bg-blue-800"
            href="/survey/foundation-demo"
          >
            Open public shell
          </Link>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-medium text-slate-800 hover:bg-slate-50"
            href="/app"
          >
            Open internal shell
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
