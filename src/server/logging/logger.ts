import "server-only";

import { redactLogValue } from "@/server/logging/redaction";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

export function writeStructuredLog(
  level: LogLevel,
  event: string,
  context: LogContext = {},
): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    context: redactLogValue(context),
  };

  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}
