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
  const activeAdminCount = rows.filter(
    (row) => row.userId && row.role === "ADMIN" && !row.disabledAt,
  ).length;
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
            {rows.map((row) => {
              const isLastActiveAdmin = Boolean(
                row.userId &&
                row.role === "ADMIN" &&
                !row.disabledAt &&
                activeAdminCount === 1,
              );
              return (
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
                    {row.userId || row.status === "INVITED" ? (
                      <RoleEditor
                        busy={busy}
                        email={row.email}
                        protectedAdmin={isLastActiveAdmin}
                        role={row.role}
                        save={(role) =>
                          row.userId
                            ? mutate(
                                `/api/admin/employees/${row.userId}`,
                                "PATCH",
                                { action: "change-role", role },
                                "Role changed and sessions revoked.",
                              )
                            : mutate(
                                `/api/admin/invitations/${row.invitationId}`,
                                "POST",
                                { action: "change-role", role },
                                "Invitation role changed.",
                              )
                        }
                      />
                    ) : (
                      row.role.replaceAll("_", " ")
                    )}
                  </td>
                  <td className="p-3">
                    {row.disabledAt
                      ? row.userId
                        ? "Deactivated"
                        : "Cancelled invitation"
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
                            className="ui-secondary px-3 py-2"
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
                            className="ui-danger px-3 py-2"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Cancel the invitation for ${row.email}? The emailed link will stop working immediately.`,
                                )
                              )
                                void mutate(
                                  `/api/admin/invitations/${row.invitationId}`,
                                  "POST",
                                  { action: "cancel" },
                                  "Invitation cancelled; the previous link is no longer usable.",
                                );
                            }}
                          >
                            Cancel invitation
                          </button>
                        </>
                      ) : null}
                      {row.userId && !row.disabledAt ? (
                        <button
                          className="ui-danger px-3 py-2"
                          disabled={busy || isLastActiveAdmin}
                          title={
                            isLastActiveAdmin
                              ? "You cannot deactivate the last active Admin. Assign another Admin first."
                              : undefined
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Deactivate ${row.email}? Their active sessions will be revoked immediately.`,
                              )
                            )
                              void mutate(
                                `/api/admin/employees/${row.userId}`,
                                "PATCH",
                                { action: "disable" },
                                "Employee deactivated and sessions revoked.",
                              );
                          }}
                        >
                          Deactivate
                        </button>
                      ) : null}
                      {row.userId && row.disabledAt ? (
                        <button
                          className="ui-secondary px-3 py-2"
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleEditor({
  busy,
  email,
  protectedAdmin,
  role,
  save,
}: {
  busy: boolean;
  email: string;
  protectedAdmin: boolean;
  role: EmployeeRole;
  save: (role: EmployeeRole) => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState(role);
  return (
    <div className="flex min-w-52 flex-col gap-2">
      <span className="text-xs text-slate-500">
        Current: {role.replaceAll("_", " ")}
      </span>
      <select
        aria-label={`Role for ${email}`}
        className="rounded border px-2 py-1"
        disabled={busy || protectedAdmin}
        onChange={(event) => {
          const nextRole = event.target.value as EmployeeRole;
          setSelectedRole(nextRole);
          if (
            nextRole === "ADMIN" &&
            !window.confirm(
              "Вы хотите назначить роль «Администратор». Вы уверены?",
            )
          ) {
            setSelectedRole(role);
            return;
          }
          void save(nextRole);
        }}
        value={selectedRole}
        title={
          protectedAdmin
            ? "You cannot change the role of the last active Admin. Assign another Admin first."
            : undefined
        }
      >
        {roles.map((validRole) => (
          <option key={validRole} value={validRole}>
            {validRole.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {protectedAdmin ? (
        <span className="text-xs text-slate-600">
          You cannot change the role of the last active Admin. Assign another
          Admin first.
        </span>
      ) : null}
    </div>
  );
}
