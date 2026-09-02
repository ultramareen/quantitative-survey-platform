import Link from "next/link";
import { SurveyManagementActions } from "@/components/surveys/pause-all-surveys";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getSurveyService } from "@/server/modules/surveys/runtime";
import type { SurveySummary } from "@/types/survey";

export default async function SurveysPage() {
  const employee = await getCurrentEmployee();
  const surveys = await getSurveyService().list(employee);
  const active = surveys.filter(
    (s) => s.status === "ACTIVE" || s.status === "PENDING_CAPACITY",
  );
  const history = surveys.filter((s) => s.status === "COMPLETED");
  const drafts = surveys.filter((s) => s.status === "DRAFT");
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
            Survey management
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Surveys</h1>
          <p className="mt-2 text-slate-600">
            Create questionnaires, manage collection state, and retain completed
            instruments.
          </p>
        </div>
        <Link
          className="rounded-lg bg-blue-700 px-4 py-3 font-medium text-white"
          href="/app/surveys/new"
        >
          Create New Survey
        </Link>
      </div>
      {employee ? <SurveyManagementActions role={employee.role} /> : null}
      <SurveySection
        title="Draft Surveys"
        empty="No Draft surveys."
        surveys={drafts}
      />
      <SurveySection
        title="Active/Operational Surveys"
        empty="No active or paused surveys."
        surveys={active}
      />
      <SurveySection
        title="Survey History"
        empty="No completed surveys."
        surveys={history}
      />
    </section>
  );
}
function SurveySection({
  title,
  empty,
  surveys,
}: {
  title: string;
  empty: string;
  surveys: SurveySummary[];
}) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-semibold">{title}</h2>
      {surveys.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-5 text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {surveys.map((survey) => (
            <Link
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
              href={`/app/surveys/${survey.id}`}
              key={survey.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{survey.title}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                  {survey.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                {survey.description || "No description."}
              </p>
              <p className="mt-4 text-xs text-slate-500">
                {survey.questionCount} questions · Author: {survey.ownerName}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
