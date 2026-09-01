import { notFound } from "next/navigation";
import { SurveyActions } from "@/components/surveys/survey-actions";
import { SurveyBuilder } from "@/components/surveys/survey-builder";
import { SurveyResults } from "@/components/results/survey-results";
import { PublicSurveyUrl } from "@/components/surveys/public-survey-url";
import { getServerEnvironment } from "@/server/config/env";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getSurveyService } from "@/server/modules/surveys/runtime";
import { buildPublicSurveyUrl } from "@/server/modules/surveys/public-url";
import { getResultsService } from "@/server/modules/results/runtime";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  let survey;
  try {
    survey = await getSurveyService().view(employee, (await params).surveyId);
  } catch {
    notFound();
  }
  const canEdit =
    survey.status === "DRAFT" &&
    (employee.role === "ADMIN" || employee.id === survey.ownerId);
  const canCalculate =
    employee.role === "ADMIN" || employee.id === survey.ownerId;
  const snapshots =
    survey.status !== "DRAFT"
      ? await getResultsService().history(employee, survey.id)
      : [];
  const publicUrl = buildPublicSurveyUrl(
    survey.publicId,
    getServerEnvironment().APP_ORIGIN,
  );
  return (
    <section>
      <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
        {survey.status.replaceAll("_", " ")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{survey.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Author: {survey.ownerName} · {survey.questionCount} questions · Version{" "}
        {survey.stateVersion}
      </p>
      <PublicSurveyUrl url={publicUrl} />
      {survey.status === "DRAFT" ? (
        <p className="mt-1 text-xs text-slate-500">Closed until activation.</p>
      ) : null}
      {survey.status !== "DRAFT" ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          This questionnaire is immutable because it has been activated.
        </p>
      ) : !canEdit ? (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">
          Only the Draft owner or an Admin can edit this questionnaire.
        </p>
      ) : null}
      <SurveyActions survey={survey} employee={employee} />
      <SurveyBuilder
        survey={survey}
        readOnly={!canEdit}
        finalActions={
          <SurveyActions
            survey={survey}
            employee={employee}
            placement="footer"
          />
        }
      />
      {survey.status !== "DRAFT" ? (
        <SurveyResults
          surveyId={survey.id}
          initial={snapshots}
          canCalculate={canCalculate}
          canExportRespondents={
            employee.role === "RESEARCHER" || employee.role === "ADMIN"
          }
        />
      ) : null}
    </section>
  );
}
