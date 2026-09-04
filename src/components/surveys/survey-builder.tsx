"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
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
}: {
  survey?: SurveyDetail;
  readOnly?: boolean;
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
  const [operation, setOperation] = useState<"save" | "activate">();
  const [draggedQuestion, setDraggedQuestion] = useState<number>();
  const [draggedOption, setDraggedOption] = useState<{
    question: number;
    option: number;
  }>();
  const editable = !survey || (!readOnly && survey.status === "DRAFT");
  const activationReady =
    title.trim().length > 0 &&
    title.trim().length <= 300 &&
    description.length <= 4000 &&
    questions.length >= 1 &&
    questions.every(
      (question) =>
        question.prompt.trim().length > 0 &&
        question.prompt.trim().length <= 4000 &&
        (question.type === "FREE_TEXT"
          ? question.options.length === 0
          : question.options.length >= 2 &&
            question.options.length <= 11 &&
            question.options.every(
              (option) =>
                option.trim().length > 0 && option.trim().length <= 1000,
            )),
    );
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
  function moveQuestion(index: number, target: number) {
    setQuestions((value) => {
      const copy = [...value];
      if (target < 0 || target >= copy.length) return value;
      const [question] = copy.splice(index, 1);
      copy.splice(target, 0, question!);
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
  async function persistDraft() {
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
    if (!response.ok) {
      throw new Error(payload.message ?? "The survey could not be saved.");
    }
    return payload.id ?? survey?.id;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOperation("save");
    setMessage(undefined);
    try {
      const id = await persistDraft();
      if (survey) {
        setMessage("Draft saved.");
        router.refresh();
      } else if (id) router.push(`/app/surveys/${id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The survey could not be saved.",
      );
    } finally {
      setBusy(false);
      setOperation(undefined);
    }
  }
  async function activate() {
    if (!activationReady || busy) return;
    setBusy(true);
    setOperation("activate");
    setMessage(undefined);
    try {
      const id = await persistDraft();
      if (!id) throw new Error("The survey could not be activated.");
      const response = await fetch(`/api/surveys/${id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition",
          target: "ACTIVE",
          stateVersion: survey?.stateVersion ?? 1,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? "The survey could not be activated.",
        );
      if (!survey) router.push(`/app/surveys/${id}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The survey could not be activated.",
      );
    } finally {
      setBusy(false);
      setOperation(undefined);
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
            placeholder="Survey title — visible to respondents"
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
            placeholder="Survey description — visible to respondents"
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
          className={`rounded-xl border bg-white p-5 transition ${
            draggedQuestion === index
              ? "border-blue-500 opacity-70 ring-2 ring-blue-200"
              : "border-slate-200"
          }`}
          data-question-index={index}
          draggable
          key={index}
          onDragEnd={() => setDraggedQuestion(undefined)}
          onDragOver={(event) => {
            if (
              event.dataTransfer.types.includes("application/x-survey-question")
            )
              event.preventDefault();
          }}
          onDragStart={(event) => {
            if (blocksQuestionDrag(event)) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-survey-question",
              String(index),
            );
            setDraggedQuestion(index);
          }}
          onDrop={(event) => {
            if (
              !event.dataTransfer.types.includes(
                "application/x-survey-question",
              )
            )
              return;
            event.preventDefault();
            const source = Number(
              event.dataTransfer.getData("application/x-survey-question"),
            );
            if (!Number.isInteger(source)) return;
            moveQuestion(source, index);
            setDraggedQuestion(undefined);
          }}
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
                    className={`mb-2 flex cursor-grab items-center gap-2 rounded-lg border border-transparent p-1 transition active:cursor-grabbing ${
                      draggedOption?.question === index &&
                      draggedOption.option === optionIndex
                        ? "border-blue-500 bg-blue-50 opacity-70 ring-2 ring-blue-200"
                        : "hover:border-slate-300"
                    }`}
                    data-option-draggable
                    data-option-index={optionIndex}
                    draggable
                    key={optionIndex}
                    onDragEnd={(event) => {
                      event.stopPropagation();
                      setDraggedOption(undefined);
                    }}
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes(
                          "application/x-survey-option",
                        )
                      )
                        event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
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
                      setDraggedOption(undefined);
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      if (blocksOptionDrag(event)) return;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-survey-option",
                        `${index}:${optionIndex}`,
                      );
                      setDraggedOption({
                        question: index,
                        option: optionIndex,
                      });
                    }}
                  >
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
                  className="ui-primary px-3 py-1.5 disabled:opacity-50"
                >
                  Add option
                </button>
              ) : null}
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
          className="ui-primary px-4 py-2 disabled:opacity-50"
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
          className="ui-secondary px-5 py-3 font-medium disabled:opacity-50"
        >
          {operation === "save" ? "Saving…" : "Save Draft"}
        </button>
        <button
          className="ui-primary px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || !activationReady}
          onClick={() => void activate()}
          title={
            activationReady
              ? undefined
              : "Complete the title and at least one valid question to activate."
          }
          type="button"
        >
          {operation === "activate" ? "Activating…" : "Activate"}
        </button>
      </div>
    </form>
  );
}

function blocksQuestionDrag(event: DragEvent<HTMLElement>) {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      "input, textarea, select, option, button, label, [data-option-draggable]",
    )
  ) {
    event.preventDefault();
    return true;
  }
  return false;
}

function blocksOptionDrag(event: DragEvent<HTMLElement>) {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest("input, textarea, select, option, button, label")
  ) {
    event.preventDefault();
    return true;
  }
  return false;
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
