import { notFound } from "next/navigation";
import { RespondentFilters } from "@/components/respondents/respondent-filters";
import { RespondentResults } from "@/components/respondents/respondent-results";
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
      <RespondentFilters
        referenceId={query.referenceId}
        surveyId={query.surveyId}
        surveys={surveys}
      />
      <RespondentResults
        respondents={result.respondents}
        total={result.total}
      />
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
