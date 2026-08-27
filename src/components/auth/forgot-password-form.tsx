"use client";

import { useState, type FormEvent } from "react";

import { FormField } from "@/components/ui/form-field";
import { readError } from "./sign-in-form";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/employee/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email") }),
    });
    if (!response.ok)
      setError(
        await readError(response, "The request could not be completed."),
      );
    else {
      const body = (await response.json()) as { message: string };
      setMessage(body.message);
    }
    setPending(false);
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <FormField
        autoComplete="email"
        id="email"
        label="Work email"
        name="email"
        required
        type="email"
      />
      {message ? (
        <p
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Send reset instructions"}
      </button>
    </form>
  );
}
