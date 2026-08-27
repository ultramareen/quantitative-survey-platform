"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      className="rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-60"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/employee/sign-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        router.replace("/sign-in");
        router.refresh();
      }}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
