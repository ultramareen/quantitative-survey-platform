export type ErrorCategory =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "CONFIGURATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "VALIDATION"
  | "INTERNAL";

type AppErrorOptions = {
  category: ErrorCategory;
  code: string;
  message: string;
  safeMessage: string;
  status: number;
  cause?: unknown;
};

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly safeMessage: string;
  readonly status: number;

  constructor({
    category,
    cause,
    code,
    message,
    safeMessage,
    status,
  }: AppErrorOptions) {
    super(message, { cause });
    this.name = "AppError";
    this.category = category;
    this.code = code;
    this.safeMessage = safeMessage;
    this.status = status;
  }
}

export function toSafeErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.safeMessage } },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    },
  };
}
