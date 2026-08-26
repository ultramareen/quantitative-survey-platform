"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-12">
      <ErrorState
        actionLabel="Try again"
        message="The request could not be completed. No sensitive details were exposed."
        onAction={reset}
        title="Something went wrong"
      />
    </main>
  );
}
