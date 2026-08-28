"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PublicSurveyOpenResult } from "@/types/public-survey";

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
  useEffect(() => {
    let active = true;
    fetch(`/api/public/surveys/${encodeURIComponent(publicId)}/open`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response
          .json()
          .catch(() => ({}))) as PublicSurveyOpenResult;
        if (active)
          setState(
            response.ok
              ? data
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
    setBusy(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/public/surveys/${encodeURIComponent(publicId)}/identify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          country: form.get("country"),
          phone: form.get("phone"),
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
  if (state.availability === "PENDING")
    return (
      <Unavailable
        title={state.title ?? "Survey temporarily unavailable"}
        body="This survey is temporarily not accepting new responses."
      />
    );
  if (state.identified)
    return (
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-semibold">{state.title}</h1>
        <p className="mt-4 text-slate-600">
          Your details have been recorded on this device.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Question answering will be available in the next approved product
          phase.
        </p>
      </section>
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
              defaultValue="RU"
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
              required
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

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-4 text-slate-600">{body}</p>
    </section>
  );
}
