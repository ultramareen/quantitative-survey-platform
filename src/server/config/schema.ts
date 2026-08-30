import { z } from "zod";

import { AppError } from "@/server/errors/app-error";
import {
  parseCryptographyConfiguration,
  type CryptographyConfiguration,
} from "@/server/modules/cryptography/key-registry";

const emailAddressSchema = z.email();
const senderNameSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => !/[\r\n]/.test(value), "must not contain newlines");

const serverEnvironmentSchema = z
  .object({
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
    MAIL_TRANSPORT: z.enum(["local-file", "brevo"]).default("local-file"),
    LOCAL_MAILBOX_PATH: z.string().min(1).optional(),
    BREVO_API_KEY: z.string().min(1).optional(),
    BREVO_FROM_EMAIL: emailAddressSchema.optional(),
    BREVO_FROM_NAME: senderNameSchema.optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    QSP_SMOKE_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((environment, context) => {
    if (
      (environment.APP_ENV === "preview" ||
        environment.APP_ENV === "production") &&
      environment.MAIL_TRANSPORT !== "brevo"
    ) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message: "preview and production require the Brevo transport",
      });
    }
    if (
      environment.MAIL_TRANSPORT === "brevo" &&
      (!environment.BREVO_API_KEY ||
        !environment.BREVO_FROM_EMAIL ||
        !environment.BREVO_FROM_NAME)
    ) {
      context.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "Brevo credentials and verified sender are required",
      });
    }
    if (
      (environment.APP_ENV === "preview" ||
        environment.APP_ENV === "production") &&
      !environment.QSP_SMOKE_TOKEN
    ) {
      context.addIssue({
        code: "custom",
        path: ["QSP_SMOKE_TOKEN"],
        message: "preview and production require a smoke-test token",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema> & {
  cryptography: CryptographyConfiguration;
};

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

  return {
    ...result.data,
    cryptography: parseCryptographyConfiguration(input),
  };
}
