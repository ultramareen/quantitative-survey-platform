import { z } from "zod";

import { AppError } from "@/server/errors/app-error";
import {
  parseCryptographyConfiguration,
  type CryptographyConfiguration,
} from "@/server/modules/cryptography/key-registry";

const emailAddressSchema = z.email();
const resendSenderSchema = z
  .string()
  .max(320)
  .refine((value) => {
    if (emailAddressSchema.safeParse(value).success) return true;
    const match = /^([^<>\r\n]{1,200}) <([^<>\r\n]+)>$/.exec(value);
    return Boolean(match && emailAddressSchema.safeParse(match[2]).success);
  }, "must be an email or a display name followed by an email");

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
    MAIL_TRANSPORT: z.enum(["local-file", "resend"]).default("local-file"),
    LOCAL_MAILBOX_PATH: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: resendSenderSchema.optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    QSP_SMOKE_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((environment, context) => {
    if (
      (environment.APP_ENV === "preview" ||
        environment.APP_ENV === "production") &&
      environment.MAIL_TRANSPORT !== "resend"
    ) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message: "preview and production require the Resend transport",
      });
    }
    if (
      environment.MAIL_TRANSPORT === "resend" &&
      (!environment.RESEND_API_KEY || !environment.RESEND_FROM_EMAIL)
    ) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Resend credentials are required",
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
