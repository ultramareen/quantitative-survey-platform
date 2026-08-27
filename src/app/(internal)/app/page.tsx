import { StatusBadge } from "@/components/ui/status-badge";

export default function InternalFoundationPage() {
  return (
    <section aria-labelledby="internal-heading">
      <StatusBadge label="Authenticated workspace" tone="info" />
      <h1
        id="internal-heading"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        Employee workspace
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        Your server-validated employee session is active. Survey and results
        workflows remain reserved for their approved later phases.
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
