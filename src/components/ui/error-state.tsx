"use client";

type ErrorStateProps = {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
};

export function ErrorState({
  actionLabel,
  message,
  onAction,
  title,
}: ErrorStateProps) {
  return (
    <section
      className="w-full rounded-xl border border-red-200 bg-red-50 p-6"
      role="alert"
    >
      <h2 className="font-semibold text-red-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{message}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 rounded-lg bg-red-800 px-4 py-2 font-medium text-white"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
