import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enter your work email. The response will not reveal whether an account
          exists.
        </p>
        <ForgotPasswordForm />
        <Link
          className="mt-5 block text-center text-sm text-blue-700 hover:underline"
          href="/sign-in"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
