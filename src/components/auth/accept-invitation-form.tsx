"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { readError } from "./sign-in-form";

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        displayName: data.get("displayName"),
        password: data.get("password"),
        passwordConfirmation: data.get("passwordConfirmation"),
      }),
    });
    if (!response.ok) {
      setError(await readError(response, "Invitation could not be accepted."));
      setBusy(false);
      return;
    }
    setDone(true);
  }
  if (done)
    return (
      <div>
        <p className="text-green-800">Your employee account is ready.</p>
        <a
          className="mt-4 inline-block text-blue-700 underline"
          href="/sign-in"
        >
          Sign in
        </a>
      </div>
    );
  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <FormField
        id="invited-email"
        label="Invited email"
        value={email}
        readOnly
        disabled
      />
      <FormField
        id="displayName"
        name="displayName"
        label="Display name"
        required
        maxLength={200}
      />
      <FormField
        id="password"
        name="password"
        label="Password"
        type="password"
        minLength={12}
        required
        autoComplete="new-password"
      />
      <FormField
        id="passwordConfirmation"
        name="passwordConfirmation"
        label="Confirm password"
        type="password"
        minLength={12}
        required
        autoComplete="new-password"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-50"
        disabled={busy}
      >
        {busy ? "Creating account…" : "Create employee account"}
      </button>
    </form>
  );
}
