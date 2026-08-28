"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const lifecycle = employee.role === "ADMIN" || employee.id === survey.ownerId;
  async function act(body: unknown) {
    setBusy(true);
    setMessage(undefined);
    const response = await fetch(`/api/surveys/${survey.id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.message ?? "The action failed.");
      return;
    }
    if (payload.id) router.push(`/app/surveys/${payload.id}`);
    else router.refresh();
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this empty Draft, or tombstone this retained survey?",
      )
    )
      return;
    setBusy(true);
    const response = await fetch(`/api/surveys/${survey.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setMessage(payload.message ?? "The action failed.");
      setBusy(false);
      return;
    }
    router.push("/app/surveys");
    router.refresh();
  }
  const transition = (target: SurveyStatus) =>
    act({ action: "transition", target, stateVersion: survey.stateVersion });
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {survey.status === "DRAFT" && lifecycle ? (
        <button
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white"
          onClick={() => transition("ACTIVE")}
        >
          Activate
        </button>
      ) : null}
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
        Duplicate as Draft
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
        <p role="status" className="w-full text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
