import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/server/errors/app-error";

export function publicError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { message: "The request is invalid." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { message: error.safeMessage },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  return NextResponse.json(
    { message: "The request could not be completed." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export function publicRateSubject(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
    .trim()
    .slice(0, 128);
}
