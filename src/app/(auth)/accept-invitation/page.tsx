import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

export const dynamic = "force-dynamic";
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  let preview = null;
  try {
    preview = token
      ? await getEmployeeManagementService().preview(token)
      : null;
  } catch {
    preview = null;
  }
  const message = !preview
    ? "This invitation is invalid or unavailable."
    : preview.state === "EXPIRED"
      ? "This invitation has expired. Ask an administrator to resend it."
      : preview.state !== "VALID"
        ? "This invitation is no longer available."
        : null;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Accept employee invitation</h1>
        {message ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {message}
          </p>
        ) : (
          <AcceptInvitationForm token={token} email={preview!.email} />
        )}
      </section>
    </main>
  );
}
