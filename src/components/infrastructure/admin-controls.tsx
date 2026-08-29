"use client";

import { useState } from "react";
import type { InfrastructureAdminView } from "@/types/infrastructure";

export function InfrastructureAdminControls({
  view,
}: {
  view: InfrastructureAdminView;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(body: object) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/infrastructure/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error((await response.json()).message ?? "Action failed.");
      setMessage(
        "Infrastructure control updated. Refresh to view the latest state.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/infrastructure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.get("provider"),
          quota: form.get("quota"),
          period: form.get("period"),
          used: Number(form.get("used")),
          limit: Number(form.get("limit")),
          collectedAt: form.get("collectedAt"),
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message ?? "Reconciliation failed.",
        );
      setMessage(
        "Dated manual provider reading saved and capacity state re-evaluated.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Reconciliation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-8 space-y-8">
      {view.headline.percent >= 99 ? (
        <p
          role="alert"
          className="rounded-lg bg-red-100 p-4 font-semibold text-red-900"
        >
          Critical usage state. The selected ACTIVE survey remains active;
          provider exhaustion may still make the service unavailable.
        </p>
      ) : view.headline.percent >= 95 ? (
        <p
          role="alert"
          className="rounded-lg bg-orange-100 p-4 text-orange-950"
        >
          Capacity protection is active. At most one survey may be ACTIVE.
        </p>
      ) : null}
      <section aria-labelledby="quota-heading">
        <h2 id="quota-heading" className="text-xl font-semibold">
          Provider quota detail
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Provider / quota",
                  "Usage",
                  "Source",
                  "Period / reset",
                  "Updated",
                  "Console",
                ].map((label) => (
                  <th key={label} className="border-b p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.quotas.map((quota) => (
                <tr key={`${quota.provider}-${quota.quota}-${quota.period}`}>
                  <td className="border-b p-2">
                    {quota.provider} / {quota.quota}
                    {quota.drivesProtection ? "" : " (detail only)"}
                  </td>
                  <td className="border-b p-2">
                    {quota.used.toLocaleString()} /{" "}
                    {quota.limit.toLocaleString()} ({quota.percent}%)
                  </td>
                  <td className="border-b p-2">
                    {quota.source.replaceAll("_", " ")}
                  </td>
                  <td className="border-b p-2">
                    {quota.period}
                    {quota.resetsAt
                      ? ` / ${new Date(quota.resetsAt).toLocaleString()}`
                      : ""}
                  </td>
                  <td className="border-b p-2">
                    {new Date(quota.updatedAt).toLocaleString()}
                    {quota.stale ? " (stale)" : ""}
                  </td>
                  <td className="border-b p-2">
                    <a
                      className="text-blue-700 underline"
                      href={quota.providerConsoleUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open provider
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <form
        action={reconcile}
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
        aria-labelledby="reconcile-heading"
      >
        <h2
          id="reconcile-heading"
          className="text-xl font-semibold sm:col-span-2"
        >
          Manual provider-dashboard reconciliation
        </h2>
        <label>
          Provider
          <select
            className="mt-1 block w-full rounded border p-2"
            name="provider"
            required
          >
            <option>NETLIFY</option>
            <option>COCKROACH</option>
            <option>RESEND</option>
          </select>
        </label>
        <label>
          Quota key
          <input
            className="mt-1 block w-full rounded border p-2"
            name="quota"
            required
          />
        </label>
        <label>
          Quota period
          <input
            className="mt-1 block w-full rounded border p-2"
            name="period"
            placeholder="YYYY-MM or YYYY-MM-DD"
            required
          />
        </label>
        <label>
          Reading time
          <input
            className="mt-1 block w-full rounded border p-2"
            name="collectedAt"
            type="datetime-local"
            required
          />
        </label>
        <label>
          Used units
          <input
            className="mt-1 block w-full rounded border p-2"
            name="used"
            type="number"
            min="0"
            step="any"
            required
          />
        </label>
        <label>
          Limit units
          <input
            className="mt-1 block w-full rounded border p-2"
            name="limit"
            type="number"
            min="0.000000001"
            step="any"
            required
          />
        </label>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white sm:col-span-2"
        >
          Save dated manual actual
        </button>
      </form>
      <section
        className="rounded-xl border p-4"
        aria-labelledby="controls-heading"
      >
        <h2 id="controls-heading" className="text-xl font-semibold">
          Capacity controls
        </h2>
        <button
          disabled={busy}
          onClick={() => action({ action: "pause-all" })}
          className="mt-3 rounded bg-red-700 px-4 py-2 font-medium text-white"
        >
          Pause all active surveys
        </button>
        <div className="mt-5 grid gap-2">
          {view.pendingSurveys.map((survey) => (
            <button
              disabled={busy || view.headline.percent < 95}
              key={survey.publicId}
              onClick={() =>
                action({ action: "switch", selectedPublicId: survey.publicId })
              }
              className="rounded border px-3 py-2 text-left"
            >
              Make “{survey.title}” ACTIVE (owner: {survey.ownerName})
            </button>
          ))}
        </div>
      </section>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
