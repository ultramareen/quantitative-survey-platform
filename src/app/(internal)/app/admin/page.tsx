import { StatusBadge } from "@/components/ui/status-badge";

export default function AdminFoundationPage() {
  return (
    <section aria-labelledby="admin-heading">
      <StatusBadge label="Route boundary only" tone="warning" />
      <h1
        id="admin-heading"
        className="mt-4 text-3xl font-semibold tracking-tight"
      >
        Administration shell
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        This route establishes the future Admin boundary only. It does not
        provide employee, authorization, or infrastructure controls.
      </p>
    </section>
  );
}
