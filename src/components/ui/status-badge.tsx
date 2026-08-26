const tones = {
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
} as const;

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
