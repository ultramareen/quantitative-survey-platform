import { SignInForm } from "@/components/auth/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice =
    reason === "session-required"
      ? "Your session is missing or expired. Sign in to continue."
      : reason === "password-reset"
        ? "Password updated. Sign in with your new password."
        : undefined;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
          Employee access
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your approved employee account.
        </p>
        {notice ? (
          <p
            className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        <SignInForm />
      </section>
    </main>
  );
}
