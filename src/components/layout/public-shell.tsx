import Link from "next/link";

export function PublicShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            className="font-semibold tracking-tight text-slate-950"
            href="/"
          >
            Quantitative Survey Platform
          </Link>
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Public
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
