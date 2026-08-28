import { SurveyBuilder } from "@/components/surveys/survey-builder";
export default function NewSurveyPage() {
  return (
    <section>
      <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
        Create New Survey
      </p>
      <h1 className="mt-2 text-3xl font-semibold">New survey Draft</h1>
      <p className="mt-2 text-slate-600">
        Drafts may be saved with zero questions. Activation validates the
        complete instrument.
      </p>
      <SurveyBuilder />
    </section>
  );
}
