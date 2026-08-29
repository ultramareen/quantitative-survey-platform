import Link from "next/link";
import type { RespondentPiiDto } from "@/types/respondent-pii";

export function RespondentTable({
  respondents,
}: Readonly<{ respondents: RespondentPiiDto[] }>) {
  if (respondents.length === 0)
    return (
      <p className="mt-6 rounded-xl border border-dashed p-5 text-slate-500">
        No respondents matched this view.
      </p>
    );
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase">
          <tr>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Survey</th>
            <th className="px-4 py-3">Coverage</th>
            <th className="px-4 py-3">Activity</th>
            <th className="px-4 py-3">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {respondents.map((respondent) => (
            <tr key={respondent.referenceId}>
              <td className="px-4 py-4 align-top font-medium">
                <Link
                  className="text-blue-700 underline-offset-2 hover:underline"
                  href={`/app/respondents/${respondent.referenceId}`}
                >
                  {respondent.referenceId}
                </Link>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="block font-medium">{respondent.name}</span>
                <span className="text-slate-600">{respondent.phone}</span>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="block">{respondent.survey.title}</span>
                <span className="text-xs text-slate-500">
                  {respondent.survey.status.replaceAll("_", " ")}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                {respondent.coverage.answeredQuestions}/
                {respondent.coverage.totalQuestions} (
                {respondent.coverage.percentage}%)
              </td>
              <td className="px-4 py-4 align-top text-xs text-slate-600">
                <span className="block">
                  Started: {formatDate(respondent.startedAt)}
                </span>
                <span className="block">
                  Last change: {formatDate(respondent.lastAnswerChangedAt)}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    respondent.state === "EDITABLE"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {respondent.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
