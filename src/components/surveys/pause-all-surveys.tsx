"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EmployeeRole } from "@/types/employee";

export function SurveyManagementActions({ role }: { role: EmployeeRole }) {
  return role === "ADMIN" ? <PauseAllSurveys /> : null;
}

export function PauseAllSurveys() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function pauseAll() {
    setBusy(true);
    setMessage(undefined);
    setError(false);
    try {
      const response = await fetch("/api/admin/infrastructure/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "pause-all" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? "Active surveys could not be paused.",
        );
      setConfirming(false);
      setMessage("All active surveys have been paused.");
      router.refresh();
      timer.current = setTimeout(() => setMessage(undefined), 3_000);
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Active surveys could not be paused.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      {!confirming ? (
        <button
          className="rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-800"
          onClick={() => setConfirming(true)}
          type="button"
        >
          Pause all active surveys
        </button>
      ) : (
        <div
          aria-labelledby="pause-all-heading"
          className="max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-4"
          role="alertdialog"
        >
          <h2 className="font-semibold" id="pause-all-heading">
            Pause all active surveys?
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            Respondents will no longer be able to submit responses to currently
            active surveys until they are resumed.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-lg border bg-white px-4 py-2"
              disabled={busy}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={pauseAll}
              type="button"
            >
              {busy ? "Pausing…" : "Pause all"}
            </button>
          </div>
        </div>
      )}
      {message ? (
        <p
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${error ? "bg-red-700" : "bg-emerald-700"}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
