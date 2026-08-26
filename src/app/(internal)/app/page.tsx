import { StatusBadge } from "@/components/ui/status-badge";

export default function InternalFoundationPage() {
  return (
    <section aria-labelledby="internal-heading">
      <StatusBadge label="Foundation preview" tone="info" />
      <h1
        id="internal-heading"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        Internal application shell
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        The employee workspace boundary is ready. Authentication, roles,
        surveys, and operational data are intentionally not implemented in this
        phase.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          "Survey workspace",
          "Results workspace",
          "Infrastructure workspace",
        ].map((label) => (
          <article
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <h2 className="font-semibold text-slate-900">{label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Reserved for an approved later phase.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
