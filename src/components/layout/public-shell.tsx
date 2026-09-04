import Link from "next/link";

export function PublicShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <a
        className="ui-primary sr-only z-50 px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#main-content"
      >
        Skip to main content
      </a>
      <header className="border-b border-[var(--border)] bg-[var(--surface-subtle)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            className="font-semibold tracking-tight text-[var(--accent)]"
            href="/"
          >
            Quantitative Survey Platform
          </Link>
          <span className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
            Public
          </span>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
