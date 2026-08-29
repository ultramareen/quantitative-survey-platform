import { notFound } from "next/navigation";
import { RespondentTable } from "@/components/respondents/respondent-table";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getInternalRespondentService } from "@/server/modules/respondents/internal-runtime";
import { getSurveyService } from "@/server/modules/surveys/runtime";

export default async function RespondentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    referenceId?: string;
    surveyId?: string;
    page?: string;
  }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role === "PRODUCT_MANAGER") notFound();
  const query = await searchParams;
  let result;
  try {
    result = await getInternalRespondentService().list(employee, {
      referenceId: query.referenceId,
      surveyId: query.surveyId,
      page: query.page ? Number(query.page) : undefined,
    });
  } catch {
    notFound();
  }
  const surveys = (await getSurveyService().list(employee)).filter(
    (survey) => survey.status !== "DRAFT",
  );
  return (
    <section>
      <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
        Restricted PII
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Respondents</h1>
      <p className="mt-2 text-slate-600">
        Locate respondents by their exact reference ID or review a survey.
      </p>
      <form className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium">
          Reference ID
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal uppercase"
            defaultValue={query.referenceId}
            maxLength={15}
            name="referenceId"
            placeholder="R-7K3M9W2X8Q4D"
          />
        </label>
        <label className="text-sm font-medium">
          Survey
          <select
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
            defaultValue={query.surveyId ?? ""}
            name="surveyId"
          >
            <option value="">All surveys</option>
            {surveys.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {survey.title}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-blue-700 px-4 py-2 font-medium text-white">
          Search
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-500">
        {result.total} respondent{result.total === 1 ? "" : "s"}
      </p>
      <RespondentTable respondents={result.respondents} />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        query={query}
      />
    </section>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  query,
}: {
  page: number;
  pageSize: number;
  total: number;
  query: { referenceId?: string; surveyId?: string };
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (query.referenceId) params.set("referenceId", query.referenceId);
    if (query.surveyId) params.set("surveyId", query.surveyId);
    params.set("page", String(target));
    return `/app/respondents?${params}`;
  };
  return (
    <nav aria-label="Respondent pages" className="mt-5 flex items-center gap-3">
      {page > 1 ? <a href={href(page - 1)}>Previous</a> : null}
      <span className="text-sm text-slate-600">
        Page {page} of {pages}
      </span>
      {page < pages ? <a href={href(page + 1)}>Next</a> : null}
    </nav>
  );
}
