"use client";
import { useState } from "react";
import type { ResultsSnapshotDto } from "@/types/results";
export function SurveyResults({
  surveyId,
  initial,
  canCalculate,
}: {
  surveyId: string;
  initial: ResultsSnapshotDto[];
  canCalculate: boolean;
}) {
  const [history, setHistory] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const latest = history[0];
  async function calculate() {
    setBusy(true);
    setError(undefined);
    const response = await fetch(`/api/surveys/${surveyId}/results`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = (await response
      .json()
      .catch(() => ({}))) as ResultsSnapshotDto & { message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "Calculation failed.");
      return;
    }
    setHistory((items) => [body, ...items]);
  }
  return (
    <section className="mt-10 border-t pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Calculated results</h2>
          <p className="mt-1 text-sm text-slate-500">
            Snapshots change only when Calculate Results is pressed.
          </p>
        </div>
        {canCalculate ? (
          <button
            onClick={() => void calculate()}
            disabled={busy}
            className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Calculating…" : "Calculate Results"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      ) : null}
      {!latest ? (
        <p className="mt-6 rounded-lg bg-slate-100 p-4">
          No calculated snapshot exists yet.
        </p>
      ) : (
        <Snapshot snapshot={latest} />
      )}{" "}
      {history.length ? (
        <div className="mt-8">
          <h3 className="font-semibold">Snapshot history</h3>
          <ul className="mt-2 grid gap-2">
            {history.map((s) => (
              <li key={s.snapshotNumber}>
                Snapshot {s.snapshotNumber} · cutoff{" "}
                {new Date(s.dataCutoffAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
function Snapshot({ snapshot }: { snapshot: ResultsSnapshotDto }) {
  const f = snapshot.funnel;
  return (
    <div className="mt-6">
      <p className="text-sm text-slate-500">
        Snapshot {snapshot.snapshotNumber} · cutoff{" "}
        {new Date(snapshot.dataCutoffAt).toLocaleString()}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {["Opened", "Identified", "Started", ">50%", "Completed"].map(
                (x) => (
                  <th className="border-b p-2" key={x}>
                    {x}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[
                String(f.opened),
                String(f.identified),
                `${f.started} (${f.startedPercentage}%)`,
                `${f.greaterThanHalf} (${f.greaterThanHalfPercentage}%)`,
                `${f.completed} (${f.completedPercentage}%)`,
              ].map((x, i) => (
                <td className="p-2" key={i}>
                  {x}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-8 grid gap-6">
        {snapshot.questions.map((q) => (
          <article className="rounded-lg border p-4" key={q.position}>
            <h3 className="font-semibold">
              {q.position}. {q.prompt}
            </h3>
            <p className="text-sm text-slate-500">
              Respondents: {q.denominator}
            </p>
            {q.options?.map((o) => (
              <p
                className={
                  o.leader
                    ? "mt-2 rounded bg-green-50 p-2 text-green-900"
                    : "mt-2 p-2"
                }
                key={o.position}
              >
                {o.label}: {o.count} ({o.percentage}%)
              </p>
            ))}
            {q.freeTextGroups?.map((g, i) => (
              <p
                className={
                  g.leader
                    ? "mt-2 rounded bg-green-50 p-2 text-green-900"
                    : "mt-2 p-2"
                }
                key={i}
              >
                {g.label}: {g.count} ({g.percentage}%)
              </p>
            ))}
            {q.truncated ? (
              <p className="mt-2 text-sm text-slate-500">
                Top 10 of {q.uniqueGroupCount} grouped answers
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
