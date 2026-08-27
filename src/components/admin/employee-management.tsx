"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { EmployeeManagementRow } from "@/types/employee-management";
import type { EmployeeRole } from "@/types/employee";

const roles: EmployeeRole[] = ["PRODUCT_MANAGER", "RESEARCHER", "ADMIN"];
export function EmployeeManagement({
  rows,
}: {
  rows: EmployeeManagementRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      "/api/admin/employees",
      "POST",
      { email: data.get("email"), role: data.get("role") },
      "Invitation sent.",
    );
    event.currentTarget.reset();
  }
  async function mutate(
    url: string,
    method: string,
    body: unknown,
    success: string,
  ) {
    setBusy(true);
    setMessage(undefined);
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setMessage(
      response.ok ? success : (payload.message ?? "The action failed."),
    );
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return (
    <div className="mt-6 space-y-8">
      <form
        className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_13rem_auto]"
        onSubmit={invite}
      >
        <label className="text-sm font-medium">
          Employee email
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            name="email"
            type="email"
            required
          />
        </label>
        <label className="text-sm font-medium">
          Assigned role
          <select
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            name="role"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          className="self-end rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
        >
          Invite employee
        </button>
      </form>
      {message ? (
        <p role="status" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Employee</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Invited</th>
              <th className="p-3">Expires</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-b align-top"
                key={row.invitationId ?? row.userId}
              >
                <td className="p-3">
                  <strong>{row.displayName ?? "Not registered"}</strong>
                  <br />
                  <span className="text-slate-600">{row.email}</span>
                </td>
                <td className="p-3">
                  {row.userId ? (
                    <select
                      aria-label={`Role for ${row.email}`}
                      defaultValue={row.role}
                      disabled={busy}
                      onChange={(e) =>
                        mutate(
                          `/api/admin/employees/${row.userId}`,
                          "PATCH",
                          { action: "change-role", role: e.target.value },
                          "Role changed and sessions revoked.",
                        )
                      }
                    >
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  ) : (
                    row.role.replaceAll("_", " ")
                  )}
                </td>
                <td className="p-3">
                  {row.disabledAt
                    ? "Disabled"
                    : row.status === "INVITED" &&
                        row.tokenExpiresAt &&
                        new Date(row.tokenExpiresAt) <= new Date()
                      ? "Invitation expired"
                      : row.status === "ACTIVE"
                        ? "Active"
                        : row.status
                            .toLowerCase()
                            .replace(/^./, (c) => c.toUpperCase())}
                </td>
                <td className="p-3">
                  {row.invitedAt
                    ? new Date(row.invitedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="p-3">
                  {row.tokenExpiresAt
                    ? new Date(row.tokenExpiresAt).toLocaleString()
                    : "—"}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {row.status === "INVITED" && row.invitationId ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/api/admin/invitations/${row.invitationId}`,
                              "POST",
                              { action: "resend" },
                              "Invitation resent; previous link invalidated.",
                            )
                          }
                        >
                          Resend invitation
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/api/admin/invitations/${row.invitationId}`,
                              "POST",
                              { action: "disable" },
                              "Invitation disabled.",
                            )
                          }
                        >
                          Disable invitation
                        </button>
                      </>
                    ) : null}
                    {row.userId && !row.disabledAt ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            `/api/admin/employees/${row.userId}`,
                            "PATCH",
                            { action: "disable" },
                            "Employee disabled and sessions revoked.",
                          )
                        }
                      >
                        Disable employee
                      </button>
                    ) : null}
                    {row.userId && row.disabledAt ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            `/api/admin/employees/${row.userId}`,
                            "PATCH",
                            { action: "reenable" },
                            "Employee re-enabled; fresh sign-in required.",
                          )
                        }
                      >
                        Re-enable employee
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
