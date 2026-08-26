const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /authorization|cookie|credential|email|key|name|password|phone|secret|token/i;

export function redactLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value))
    return value.map((item) => redactLogValue(item, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";

  seen.add(value);
  const redacted = Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactLogValue(nestedValue, seen),
    ]),
  );
  seen.delete(value);
  return redacted;
}
