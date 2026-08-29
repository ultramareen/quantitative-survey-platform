import type { InfrastructureHeadline } from "@/types/infrastructure";

const colors = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  "strong-orange": "bg-orange-600",
  red: "bg-red-600",
  critical: "bg-red-800",
} as const;

export function InfrastructureUsageHeadline({
  value,
}: {
  value: InfrastructureHeadline;
}) {
  const width = Math.min(100, Math.max(0, value.percent));
  return (
    <section
      aria-label="Estimated infrastructure usage"
      className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Estimated Infrastructure Usage — {value.percent}%
        </h2>
        <span className="text-xs text-slate-500">
          {value.source?.replaceAll("_", " ") ?? "APPLICATION ESTIMATE"} ·{" "}
          {new Date(value.updatedAt).toLocaleString()}
          {value.stale ? " · stale" : ""}
        </span>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Estimated infrastructure usage percentage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(value.percent))}
      >
        <div
          className={`h-full ${colors[value.tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Application estimates are conservative and are not provider-actual
        values. Provider dashboards remain authoritative.
      </p>
    </section>
  );
}
