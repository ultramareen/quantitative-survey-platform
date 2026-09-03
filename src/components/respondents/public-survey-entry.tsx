"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  PublicAnswerValue,
  PublicAttemptState,
  PublicQuestion,
  PublicSurveyOpenResult,
} from "@/types/public-survey";
import {
  acknowledgePending,
  pendingFor,
  purgePending,
  retainPending,
} from "./pending-mutations";
import { isCompletePhone } from "@/lib/phone-validation";

const countries = [
  ["US", "United States (+1)"],
  ["CA", "Canada (+1)"],
  ["GB", "United Kingdom (+44)"],
  ["RU", "Russia (+7)"],
  ["DE", "Germany (+49)"],
  ["FR", "France (+33)"],
  ["ES", "Spain (+34)"],
  ["IT", "Italy (+39)"],
  ["NL", "Netherlands (+31)"],
  ["PL", "Poland (+48)"],
  ["TR", "Türkiye (+90)"],
  ["AE", "United Arab Emirates (+971)"],
  ["IN", "India (+91)"],
  ["CN", "China (+86)"],
  ["JP", "Japan (+81)"],
  ["KR", "South Korea (+82)"],
  ["AU", "Australia (+61)"],
  ["BR", "Brazil (+55)"],
  ["MX", "Mexico (+52)"],
  ["ZA", "South Africa (+27)"],
] as const;

export function PublicSurveyEntry({ publicId }: { publicId: string }) {
  const [state, setState] = useState<PublicSurveyOpenResult>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState("RU");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/surveys/${encodeURIComponent(publicId)}/open`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response
          .json()
          .catch(() => ({}))) as PublicSurveyOpenResult;
        if (!active) return;
        if (response.ok && data.availability !== "UNAVAILABLE") {
          setState(data);
          return;
        }
        const attempt = await fetch(
          `/api/public/surveys/${encodeURIComponent(publicId)}/attempt`,
          { cache: "no-store" },
        );
        setState(
          attempt.ok
            ? { availability: "ACTIVE", identified: true }
            : { availability: "UNAVAILABLE", identified: false },
        );
      })
      .catch(
        () =>
          active &&
          setState({ availability: "UNAVAILABLE", identified: false }),
      );
    return () => {
      active = false;
    };
  }, [publicId]);
  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    if (!isCompletePhone(phone, country)) {
      setMessage("Enter a valid and complete phone number.");
      return;
    }
    setBusy(true);
    const response = await fetch(
      `/api/public/surveys/${encodeURIComponent(publicId)}/identify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          country,
          phone,
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.message ?? "We could not record your details.");
      return;
    }
    setState((value) => (value ? { ...value, identified: true } : value));
  }
  if (!state)
    return (
      <section
        className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10"
        aria-live="polite"
      >
        <p>Opening survey…</p>
      </section>
    );
  if (state.availability === "UNAVAILABLE")
    return (
      <Unavailable
        title="This survey is unavailable"
        body="The survey cannot accept responses at this time."
      />
    );
  if (state.identified) return <Questionnaire publicId={publicId} />;
  if (state.availability === "PENDING")
    return (
      <Unavailable
        title={state.title ?? "Survey temporarily unavailable"}
        body="This survey is temporarily not accepting new responses."
      />
    );
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
      <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
        Public survey
      </p>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{state.title}</h1>
      {state.description ? (
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          {state.description}
        </p>
      ) : null}
      <form className="mt-8 grid gap-5" onSubmit={identify}>
        <label className="font-medium">
          Your name
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3"
            name="name"
            autoComplete="name"
            maxLength={200}
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <label className="font-medium">
            Phone country
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3"
              name="country"
              onChange={(event) => setCountry(event.target.value)}
              value={country}
            >
              {countries.map(([code, label]) => (
                <option value={code} key={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="font-medium">
            Phone number
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              maxLength={64}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => {
                if (
                  /^\d$/.test(event.key) &&
                  phone.trim().startsWith("+7") &&
                  phone.replace(/\D/g, "").length >= 11 &&
                  event.currentTarget.selectionStart ===
                    event.currentTarget.selectionEnd
                )
                  event.preventDefault();
              }}
              required
              value={phone}
            />
          </label>
        </div>
        <p className="text-sm text-slate-500">
          Select the country for local numbers, or enter a complete
          international number beginning with +.
        </p>
        {message ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {message}
          </p>
        ) : null}
        <button
          disabled={busy}
          className="rounded-lg bg-blue-700 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Recording…" : "Begin survey"}
        </button>
      </form>
    </section>
  );
}

function Questionnaire({ publicId }: { publicId: string }) {
  const [attempt, setAttempt] = useState<PublicAttemptState>();
  const [saveState, setSaveState] = useState("Loading…");
  const [submitted, setSubmitted] = useState(false);
  const [missing, setMissing] = useState<number[]>([]);
  const queue = useRef(Promise.resolve());
  const attemptRef = useRef<PublicAttemptState | undefined>(undefined);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const scheduledValues = useRef(new Map<number, PublicAnswerValue>());
  useEffect(() => {
    void fetch(`/api/public/surveys/${encodeURIComponent(publicId)}/attempt`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const state = (await r.json()) as PublicAttemptState;
        attemptRef.current = state;
        setAttempt(state);
        setSaveState("Saved");
        for (const pending of await pendingFor(publicId))
          void save(pending.questionPosition, pending.value, state);
      })
      .catch(() => {
        void purgePending(publicId);
        setSaveState("This response is unavailable.");
      });
    // Initial recovery intentionally runs only when the public survey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);
  function save(
    position: number,
    value: PublicAnswerValue,
    base = attemptRef.current,
  ) {
    if (!base) return;
    setSaveState("Saving…");
    queue.current = queue.current
      .then(async () => {
        const current = attemptRef.current ?? base;
        const mutation = {
          questionPosition: position,
          value,
          generation: current.generation,
          baseRevision: current.revision,
          mutationId: crypto.randomUUID(),
        };
        await retainPending({
          ...mutation,
          publicId,
          localTimestamp: Date.now(),
        });
        const response = await fetch(
          `/api/public/surveys/${encodeURIComponent(publicId)}/attempt`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(mutation),
          },
        );
        if (!response.ok) throw new Error();
        const next = (await response.json()) as PublicAttemptState;
        attemptRef.current = next;
        setAttempt(next);
        if (next.conflict) throw new Error();
        await acknowledgePending(publicId, position);
        setSaveState("Saved");
      })
      .catch(() => setSaveState("Retry needed"));
  }
  function schedule(position: number, value: PublicAnswerValue, delay: number) {
    scheduledValues.current.set(position, value);
    const current = timers.current.get(position);
    if (current) clearTimeout(current);
    timers.current.set(
      position,
      setTimeout(() => {
        timers.current.delete(position);
        scheduledValues.current.delete(position);
        save(position, value);
      }, delay),
    );
  }
  async function submit() {
    for (const [position, value] of scheduledValues.current) {
      const timer = timers.current.get(position);
      if (timer) clearTimeout(timer);
      timers.current.delete(position);
      save(position, value);
    }
    scheduledValues.current.clear();
    await queue.current;
    const current = attemptRef.current;
    if (!current) return;
    setSaveState("Submitting…");
    const response = await fetch(
      `/api/public/surveys/${encodeURIComponent(publicId)}/attempt`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          generation: current.generation,
          baseRevision: current.revision,
        }),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      submitted?: boolean;
      missingRequiredPositions?: number[];
      message?: string;
    };
    if (!response.ok) {
      setSaveState(result.message ?? "Retry needed");
      return;
    }
    if (!result.submitted) {
      setMissing(result.missingRequiredPositions ?? []);
      setSaveState("Answer the required questions shown below.");
      return;
    }
    setMissing([]);
    setSubmitted(true);
    setSaveState("Saved");
  }
  if (!attempt)
    return <Unavailable title="Opening your response" body={saveState} />;
  if (attempt.paused)
    return (
      <Unavailable
        title={attempt.title}
        body="This survey is temporarily paused and is not accepting response changes."
      />
    );
  if (attempt.recorded)
    return (
      <Unavailable
        title={attempt.title}
        body="Your response has already been recorded."
      />
    );
  if (submitted)
    return (
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
        <p>Thank you. Your response has been recorded.</p>
      </section>
    );
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
      <h1 className="text-2xl font-semibold">{attempt.title}</h1>
      {attempt.description ? (
        <p className="mt-3 text-slate-600">{attempt.description}</p>
      ) : null}
      <p className="mt-4 text-sm" aria-live="polite">
        {saveState}
      </p>
      <div className="mt-8 grid gap-8">
        {attempt.questions.map((q) => (
          <QuestionField
            key={q.position}
            question={q}
            value={attempt.answers[String(q.position)]}
            save={(v) => save(q.position, v)}
            schedule={(v, delay) => schedule(q.position, v, delay)}
            missing={missing.includes(q.position)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        className="mt-8 rounded-lg bg-blue-700 px-5 py-3 font-medium text-white"
      >
        Submit response
      </button>
    </section>
  );
}

function QuestionField({
  question,
  value,
  save,
  schedule,
  missing,
}: {
  question: PublicQuestion;
  value: PublicAnswerValue | undefined;
  save: (value: PublicAnswerValue) => void;
  schedule: (value: PublicAnswerValue, delay: number) => void;
  missing: boolean;
}) {
  const heading = `${question.position}. ${question.prompt}`;
  if (question.type === "FREE_TEXT")
    return (
      <label className="grid gap-2 font-medium">
        {heading}{" "}
        <span className="text-sm font-normal text-slate-500">
          {question.required ? "Required" : "Optional"}
        </span>
        {missing ? (
          <span role="alert" className="text-sm text-red-700">
            This required question needs an answer.
          </span>
        ) : null}
        <textarea
          className="min-h-32 rounded-lg border p-3"
          defaultValue={typeof value === "string" ? value : ""}
          maxLength={10000}
          onChange={(e) => schedule(e.target.value, 750)}
          onBlur={(e) => save(e.target.value)}
        />
      </label>
    );
  return (
    <fieldset>
      <legend className="font-medium">
        {heading}{" "}
        <span className="text-sm font-normal text-slate-500">
          {question.required ? "Required" : "Optional"}
        </span>
      </legend>
      {missing ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          This required question needs an answer.
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {question.options.map((o) => (
          <label key={o.position} className="flex items-start gap-3">
            <input
              className="mt-1 shrink-0"
              type={question.type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
              name={`q-${question.position}`}
              checked={
                question.type === "SINGLE_CHOICE"
                  ? value === o.position
                  : Array.isArray(value) && value.includes(o.position)
              }
              onChange={() => {
                if (question.type === "SINGLE_CHOICE") save(o.position);
                else {
                  const current = Array.isArray(value) ? value : [];
                  schedule(
                    current.includes(o.position)
                      ? current.filter((v) => v !== o.position)
                      : [...current, o.position],
                    250,
                  );
                }
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-4 text-slate-600">{body}</p>
    </section>
  );
}
