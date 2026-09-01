"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  QuestionType,
  SurveyDetail,
  SurveyDraftInput,
} from "@/types/survey";

const blankQuestion = (): SurveyDraftInput["questions"][number] => ({
  prompt: "",
  type: "SINGLE_CHOICE",
  required: false,
  options: ["", ""],
});

export function SurveyBuilder({
  survey,
  readOnly = false,
  finalActions,
}: {
  survey?: SurveyDetail;
  readOnly?: boolean;
  finalActions?: ReactNode;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(survey?.title ?? "");
  const [description, setDescription] = useState(survey?.description ?? "");
  const [questions, setQuestions] = useState<SurveyDraftInput["questions"]>(
    survey?.questions.map(({ prompt, type, required, options }) => ({
      prompt,
      type,
      required,
      options,
    })) ?? [],
  );
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const editable = !survey || (!readOnly && survey.status === "DRAFT");
  function changeQuestion(
    index: number,
    patch: Partial<SurveyDraftInput["questions"][number]>,
  ) {
    setQuestions((value) =>
      value.map((question, i) =>
        i === index ? { ...question, ...patch } : question,
      ),
    );
  }
  function move(index: number, offset: number) {
    setQuestions((value) => {
      const copy = [...value];
      const target = index + offset;
      if (target < 0 || target >= copy.length) return value;
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
  }
  function moveOption(
    questionIndex: number,
    optionIndex: number,
    target: number,
  ) {
    if (target < 0 || target >= questions[questionIndex]!.options.length)
      return;
    setQuestions((value) =>
      value.map((question, index) => {
        if (index !== questionIndex) return question;
        const options = [...question.options];
        const [option] = options.splice(optionIndex, 1);
        options.splice(target, 0, option!);
        return { ...question, options };
      }),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const response = await fetch(
      survey ? `/api/surveys/${survey.id}` : "/api/surveys",
      {
        method: survey ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, questions }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.message ?? "The survey could not be saved.");
      return;
    }
    if (payload.id) router.push(`/app/surveys/${payload.id}`);
    else {
      setMessage("Draft saved.");
      router.refresh();
    }
  }
  if (survey && !editable) return <ReadOnlyQuestions survey={survey} />;
  return (
    <form className="mt-6 space-y-6" onSubmit={save}>
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="font-medium">
          Survey title
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={300}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="font-medium">
          Description{" "}
          <span className="font-normal text-slate-500">(optional)</span>
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Questions{" "}
          <span className="text-sm font-normal text-slate-500">
            {questions.length}/50
          </span>
        </h2>
      </div>
      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-slate-600">
          This Draft has no questions. Add at least one before activation.
        </p>
      ) : null}
      {questions.map((question, index) => (
        <fieldset
          className="rounded-xl border border-slate-200 bg-white p-5"
          key={index}
        >
          <legend className="px-2 font-semibold">Question {index + 1}</legend>
          <div className="grid gap-4">
            <label>
              Question text
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border px-3 py-2"
                required
                maxLength={4000}
                value={question.prompt}
                onChange={(e) =>
                  changeQuestion(index, { prompt: e.target.value })
                }
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Question type
                <select
                  className="mt-2 w-full rounded-lg border px-3 py-2"
                  value={question.type}
                  onChange={(e) => {
                    const type = e.target.value as QuestionType;
                    changeQuestion(index, {
                      type,
                      options:
                        type === "FREE_TEXT"
                          ? []
                          : question.options.length
                            ? question.options
                            : ["", ""],
                    });
                  }}
                >
                  <option value="SINGLE_CHOICE">Single choice</option>
                  <option value="MULTIPLE_CHOICE">Multiple choice</option>
                  <option value="FREE_TEXT">Free text</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border px-3 py-2">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(e) =>
                    changeQuestion(index, { required: e.target.checked })
                  }
                />
                {question.required ? "Required" : "Optional"}
              </label>
            </div>
            {question.type !== "FREE_TEXT" ? (
              <div>
                <div className="mb-2 flex justify-between">
                  <strong>Answer options ({question.options.length}/11)</strong>
                </div>
                {question.options.map((option, optionIndex) => (
                  <div
                    className="mb-2 flex items-center gap-2"
                    data-option-index={optionIndex}
                    key={optionIndex}
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes(
                          "application/x-survey-option",
                        )
                      )
                        event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const [sourceQuestion, sourceOption] = event.dataTransfer
                        .getData("application/x-survey-option")
                        .split(":")
                        .map(Number);
                      if (
                        sourceQuestion !== index ||
                        !Number.isInteger(sourceOption)
                      )
                        return;
                      moveOption(index, sourceOption!, optionIndex);
                    }}
                  >
                    <button
                      aria-label={`Drag question ${index + 1} option ${optionIndex + 1}`}
                      className="cursor-grab rounded border px-2 py-2 text-slate-500 active:cursor-grabbing"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-survey-option",
                          `${index}:${optionIndex}`,
                        );
                      }}
                      type="button"
                    >
                      <span aria-hidden="true">⋮⋮</span>
                    </button>
                    <input
                      aria-label={`Question ${index + 1} option ${optionIndex + 1}`}
                      className="min-w-0 flex-1 rounded-lg border px-3 py-2"
                      required
                      maxLength={1000}
                      value={option}
                      onChange={(e) =>
                        changeQuestion(index, {
                          options: question.options.map((v, i) =>
                            i === optionIndex ? e.target.value : v,
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={`Move question ${index + 1} option ${optionIndex + 1} up`}
                      disabled={optionIndex === 0}
                      onClick={() =>
                        moveOption(index, optionIndex, optionIndex - 1)
                      }
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move question ${index + 1} option ${optionIndex + 1} down`}
                      disabled={optionIndex === question.options.length - 1}
                      onClick={() =>
                        moveOption(index, optionIndex, optionIndex + 1)
                      }
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        changeQuestion(index, {
                          options: question.options.filter(
                            (_, i) => i !== optionIndex,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm">
                Respondents will enter free text. This type has no answer
                options.
              </p>
            )}
            <div className="flex flex-wrap gap-3 border-t pt-3">
              {question.type !== "FREE_TEXT" ? (
                <button
                  type="button"
                  disabled={question.options.length >= 11}
                  onClick={() =>
                    changeQuestion(index, {
                      options: [...question.options, ""],
                    })
                  }
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-50"
                >
                  Add option
                </button>
              ) : null}
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={index === questions.length - 1}
                onClick={() => move(index, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className="text-red-700"
                onClick={() =>
                  setQuestions((v) => v.filter((_, i) => i !== index))
                }
              >
                Remove question
              </button>
            </div>
          </div>
        </fieldset>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={questions.length >= 50}
          onClick={() => setQuestions((v) => [...v, blankQuestion()])}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium disabled:opacity-50"
        >
          Add question
        </button>
      </div>
      {message ? (
        <p role="status" className="rounded-lg bg-slate-100 p-3">
          {message}
        </p>
      ) : null}
      <div
        aria-label="Survey final actions"
        className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6"
        role="group"
      >
        <button
          disabled={busy}
          className="rounded-lg bg-slate-200 px-5 py-3 font-medium text-slate-900 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Draft"}
        </button>
        {finalActions}
      </div>
    </form>
  );
}

function ReadOnlyQuestions({ survey }: { survey: SurveyDetail }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border bg-white p-5">
        <p className="text-slate-600">
          {survey.description || "No description."}
        </p>
      </div>
      {survey.questions.map((question) => (
        <article className="rounded-xl border bg-white p-5" key={question.id}>
          <p className="font-semibold">
            {question.position}. {question.prompt}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {question.type.replaceAll("_", " ")} ·{" "}
            {question.required ? "Required" : "Optional"}
          </p>
          {question.options.length ? (
            <ol className="mt-3 list-decimal pl-6">
              {question.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ol>
          ) : null}
        </article>
      ))}
    </div>
  );
}
