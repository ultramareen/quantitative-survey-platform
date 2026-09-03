"use client";

import { useEffect, useRef, useState } from "react";

export function PublicSurveyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(false);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(true);
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <span>Public URL:</span>
      <a
        className="min-w-0 break-all text-blue-700 underline hover:text-blue-900"
        href={url}
      >
        {url}
      </a>
      <button
        aria-label="Copy public survey URL"
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        onClick={copy}
        type="button"
      >
        <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
      </button>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
      {error ? (
        <span className="text-red-700" role="alert">
          Copy failed. Select and copy the URL manually.
        </span>
      ) : null}
    </div>
  );
}
