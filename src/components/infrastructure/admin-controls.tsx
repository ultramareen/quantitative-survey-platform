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
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Operational view of the free-tier limits that keep this service at $0.
          Application estimates update automatically. Netlify and Cockroach
          readings drive survey protection. Brevo is monitored for email
          capacity only.
        </p>
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
              {view.quotas.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={6}>
                    No quota readings are available yet. The scheduled usage
                    check will populate estimates.
                  </td>
                </tr>
              ) : null}
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
      <section
        className="rounded-xl border p-4"
        aria-labelledby="controls-heading"
      >
        <h2 id="controls-heading" className="text-xl font-semibold">
          Capacity controls
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          At 95% usage or above, select which paused survey may remain active.
        </p>
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
