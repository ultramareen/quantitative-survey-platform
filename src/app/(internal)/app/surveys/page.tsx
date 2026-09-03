import Link from "next/link";
import { SurveyManagementActions } from "@/components/surveys/pause-all-surveys";
import { SurveySections } from "@/components/surveys/survey-sections";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getSurveyService } from "@/server/modules/surveys/runtime";

export default async function SurveysPage() {
  const employee = await getCurrentEmployee();
  const surveys = await getSurveyService().list(employee);
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
      <SurveySections surveys={surveys} />
    </section>
  );
}
