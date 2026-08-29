import "server-only";

import { NextResponse } from "next/server";
import { AppError } from "@/server/errors/app-error";

export const PII_RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  pragma: "no-cache",
};

export function respondentAccessError(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { message: error.safeMessage },
      { status: error.status, headers: PII_RESPONSE_HEADERS },
    );
  return NextResponse.json(
    { message: "The request could not be completed." },
    { status: 500, headers: PII_RESPONSE_HEADERS },
  );
}
