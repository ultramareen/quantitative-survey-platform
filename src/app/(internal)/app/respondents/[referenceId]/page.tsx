import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/components/respondents/respondent-table";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getInternalRespondentService } from "@/server/modules/respondents/internal-runtime";

export default async function RespondentDetailPage({
  params,
}: {
  params: Promise<{ referenceId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role === "PRODUCT_MANAGER") notFound();
  let respondent;
  try {
    respondent = await getInternalRespondentService().detail(
      employee,
      (await params).referenceId,
    );
  } catch {
    notFound();
  }
  return (
    <section className="max-w-3xl">
      <Link className="text-sm text-blue-700" href="/app/respondents">
        ← Respondents
      </Link>
      <p className="mt-6 text-sm font-semibold tracking-wide text-blue-700 uppercase">
        Restricted PII
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{respondent.referenceId}</h1>
      <dl className="mt-6 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <Item label="Name" value={respondent.name} />
        <Item label="Phone" value={respondent.phone} />
        <Item label="Survey" value={respondent.survey.title} />
        <Item
          label="Survey state"
          value={respondent.survey.status.replaceAll("_", " ")}
        />
        <Item
          label="Coverage"
          value={`${respondent.coverage.answeredQuestions}/${respondent.coverage.totalQuestions} (${respondent.coverage.percentage}%)`}
        />
        <Item label="Response state" value={respondent.state} />
        <Item label="Identified" value={formatDate(respondent.identifiedAt)} />
        <Item label="Started" value={formatDate(respondent.startedAt)} />
        <Item
          label="Last answer change"
          value={formatDate(respondent.lastAnswerChangedAt)}
        />
        <Item
          label="Last activity"
          value={formatDate(respondent.lastActivityAt)}
        />
      </dl>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
