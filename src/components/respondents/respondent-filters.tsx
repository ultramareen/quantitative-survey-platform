"use client";

type SurveyOption = {
  id: string;
  title: string;
};

export function RespondentFilters({
  referenceId,
  surveyId,
  surveys,
}: Readonly<{
  referenceId?: string;
  surveyId?: string;
  surveys: SurveyOption[];
}>) {
  return (
    <form className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-medium">
        Reference ID
        <input
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal uppercase"
          defaultValue={referenceId}
          maxLength={15}
          name="referenceId"
          placeholder="R-7K3M9W2X8Q4D"
        />
      </label>
      <label className="text-sm font-medium">
        Survey
        <select
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
          defaultValue={surveyId ?? ""}
          name="surveyId"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
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
  );
}
