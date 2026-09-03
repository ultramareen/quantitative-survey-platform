import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";

export default function InternalFoundationPage() {
  return (
    <section aria-labelledby="internal-heading">
      <StatusBadge label="Authenticated workspace" tone="info" />
      <h1
        id="internal-heading"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        Survey workspace
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        Create, review, and manage quantitative survey questionnaires.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Create New Survey", "Active Surveys", "Survey History"].map(
          (label) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              key={label}
            >
              <h2 className="font-semibold text-slate-900">
                <Link
                  href={
                    label === "Create New Survey"
                      ? "/app/surveys/new"
                      : "/app/surveys"
                  }
                >
                  {label}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Open survey management.
              </p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
