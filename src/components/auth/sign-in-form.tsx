"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormField } from "@/components/ui/form-field";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/employee/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
      }),
    });
    if (!response.ok) {
      setError(await readError(response, "Sign-in could not be completed."));
      setPending(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <FormField
        autoComplete="username"
        id="email"
        label="Work email"
        name="email"
        required
        type="email"
      />
      <FormField
        autoComplete="current-password"
        id="password"
        label="Password"
        name="password"
        required
        type="password"
      />
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link
        className="block text-center text-sm text-blue-700 hover:underline"
        href="/forgot-password"
      >
        Forgot password?
      </Link>
    </form>
  );
}

export async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: { message?: string };
    };
    return body.message ?? body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
