"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { EmployeePrincipal } from "@/types/employee";
import type { SurveyDetail, SurveyStatus } from "@/types/survey";

export function SurveyActions({
  survey,
  employee,
}: {
  survey: SurveyDetail;
  employee: EmployeePrincipal;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<string>();
  const actionLock = useRef(false);
  const lifecycle = employee.role === "ADMIN" || employee.id === survey.ownerId;
  async function act(body: unknown) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setOperation(
      (body as { action?: string }).action === "duplicate"
        ? "Duplicating survey…"
        : "Updating survey…",
    );
    setMessage(undefined);
    try {
      const response = await fetch(`/api/surveys/${survey.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!response.ok) {
        setMessage(payload.message ?? "The action failed.");
        return;
      }
      if (payload.id) router.push(`/app/surveys/${payload.id}`);
      else router.refresh();
    } catch {
      setMessage("The action could not be completed. Please try again.");
    } finally {
      actionLock.current = false;
      setBusy(false);
      setOperation(undefined);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this empty Draft, or tombstone this retained survey?",
      )
    )
      return;
    setBusy(true);
    setOperation("Deleting survey…");
    const response = await fetch(`/api/surveys/${survey.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setMessage(payload.message ?? "The action failed.");
      setBusy(false);
      setOperation(undefined);
      return;
    }
    router.push("/app/surveys");
    router.refresh();
  }
  const transition = (target: SurveyStatus) =>
    act({ action: "transition", target, stateVersion: survey.stateVersion });
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {survey.status === "ACTIVE" && lifecycle ? (
        <>
          <button
            disabled={busy}
            className="rounded-lg border px-4 py-2"
            onClick={() => transition("PENDING_CAPACITY")}
          >
            Pause
          </button>
          <button
            disabled={busy}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-800"
            onClick={() => transition("COMPLETED")}
          >
            Complete permanently
          </button>
        </>
      ) : null}
      {survey.status === "PENDING_CAPACITY" && lifecycle ? (
        <>
          <button
            disabled={busy}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-white"
            onClick={() => transition("ACTIVE")}
          >
            Reactivate
          </button>
          <button
            disabled={busy}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-800"
            onClick={() => transition("COMPLETED")}
          >
            Complete permanently
          </button>
        </>
      ) : null}
      <button
        disabled={busy}
        className="rounded-lg border px-4 py-2"
        onClick={() => act({ action: "duplicate" })}
      >
        {operation === "Duplicating survey…"
          ? "Duplicating…"
          : "Duplicate as Draft"}
      </button>
      {employee.role === "ADMIN" ? (
        <button
          disabled={busy}
          className="rounded-lg border px-4 py-2 text-red-700"
          onClick={remove}
        >
          Delete / tombstone
        </button>
      ) : null}
      {message ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {message}
        </p>
      ) : null}
      {operation === "Duplicating survey…" ? (
        <div
          aria-live="polite"
          aria-busy="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          role="status"
        >
          <div className="rounded-xl bg-white px-6 py-5 font-medium shadow-xl">
            {operation}
          </div>
        </div>
      ) : null}
    </div>
  );
}
