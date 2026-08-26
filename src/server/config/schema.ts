import { z } from "zod";

import { AppError } from "@/server/errors/app-error";

const serverEnvironmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "preview", "production"]),
  APP_ORIGIN: z
    .url()
    .refine(
      (value) =>
        value.startsWith("https://") || value.startsWith("http://localhost"),
      {
        message: "must use HTTPS except on localhost",
      },
    ),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      {
        message: "must be a PostgreSQL-compatible URL",
      },
    ),
  BETTER_AUTH_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  input: NodeJS.ProcessEnv,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(input);

  if (!result.success) {
    const invalidFields = [
      ...new Set(
        result.error.issues.map((issue) =>
          String(issue.path[0] ?? "environment"),
        ),
      ),
    ];

    throw new AppError({
      category: "CONFIGURATION",
      code: "INVALID_SERVER_CONFIGURATION",
      message: `Invalid required configuration: ${invalidFields.join(", ")}`,
      safeMessage: "The application is not configured correctly.",
      status: 500,
    });
  }

  return result.data;
}
