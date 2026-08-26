export function LoadingState({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-48 items-center justify-center gap-3 text-slate-600"
      role="status"
    >
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700"
      />
      <span>{label}</span>
    </div>
  );
}
