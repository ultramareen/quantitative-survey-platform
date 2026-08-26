import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";

export default function SignInFoundationPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <StatusBadge label="Authentication not active" tone="neutral" />
        <h1 className="mt-4 text-2xl font-semibold">Employee sign-in shell</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Authentication is intentionally deferred to its approved phase.
        </p>
        <form className="mt-6 space-y-4" aria-label="Inactive sign-in preview">
          <FormField
            disabled
            id="email"
            label="Work email"
            name="email"
            placeholder="employee@example.com"
            type="email"
          />
          <button
            className="w-full cursor-not-allowed rounded-lg bg-slate-300 px-4 py-3 font-medium text-slate-600"
            disabled
            type="button"
          >
            Sign-in unavailable in Phase 0
          </button>
        </form>
      </section>
    </main>
  );
}
