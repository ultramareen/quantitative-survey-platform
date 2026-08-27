import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServerEnvironment } from "@/server/config/env";
import { assertTrustedMutationOrigin } from "@/server/http/csrf";
import { AppError } from "@/server/errors/app-error";

export function requireTrustedMutation(request: NextRequest) {
  assertTrustedMutationOrigin(request, getServerEnvironment().APP_ORIGIN);
}

export function managementError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { message: "The request is invalid." },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { message: error.safeMessage },
      { status: error.status },
    );
  if (error && typeof error === "object") {
    const item = error as { status?: unknown; message?: unknown };
    const status =
      typeof item.status === "number" && item.status >= 400 && item.status < 500
        ? item.status
        : 500;
    return NextResponse.json(
      {
        message:
          status === 500
            ? "The request could not be completed."
            : String(item.message ?? "The request could not be completed."),
      },
      { status },
    );
  }
  return NextResponse.json(
    { message: "The request could not be completed." },
    { status: 500 },
  );
}
