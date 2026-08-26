import { StatusBadge } from "@/components/ui/status-badge";

export default async function PublicSurveyFoundationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
      <StatusBadge label="Foundation preview" tone="info" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        Public survey shell
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
        This responsive boundary is ready for the approved respondent flow. No
        survey or respondent functionality is active in Phase 0.
      </p>
      <p className="mt-6 text-sm text-slate-500">
        Synthetic route reference: {publicId}
      </p>
    </section>
  );
}
