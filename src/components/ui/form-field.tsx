import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function FormField({
  error,
  hint,
  id,
  label,
  ...inputProps
}: FormFieldProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
      </label>
      <input
        {...inputProps}
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
        id={id}
      />
      {error ? (
        <p
          className="mt-2 text-sm text-red-700"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-sm text-slate-500" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
