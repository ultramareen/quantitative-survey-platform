"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormField } from "@/components/ui/form-field";
import { readError } from "./sign-in-form";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirmation")) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }
    const response = await fetch("/api/auth/employee/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    if (!response.ok) {
      setError(
        await readError(response, "Password reset could not be completed."),
      );
      setPending(false);
      return;
    }
    router.replace("/sign-in?reason=password-reset");
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <FormField
        autoComplete="new-password"
        hint="Use at least 12 characters."
        id="password"
        label="New password"
        minLength={12}
        name="password"
        required
        type="password"
      />
      <FormField
        autoComplete="new-password"
        id="confirmation"
        label="Confirm new password"
        minLength={12}
        name="confirmation"
        required
        type="password"
      />
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white disabled:opacity-60"
        disabled={pending || !token}
        type="submit"
      >
        {pending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
