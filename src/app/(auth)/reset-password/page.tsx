import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        {!token ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            This password reset link is invalid or expired.
          </p>
        ) : null}
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
