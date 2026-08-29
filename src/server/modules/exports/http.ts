import "server-only";

import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { AppError } from "@/server/errors/app-error";
import type { ExportResult } from "./types";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const EXPORT_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

export function exportResponse(result: ExportResult) {
  const stream = Readable.toWeb(result.stream as Readable);
  return new Response(stream as ReadableStream, {
    headers: {
      ...EXPORT_HEADERS,
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="${result.filename}"`,
      "x-exported-at": result.exportedAt,
      "x-export-source-at": result.sourceAt,
      "x-export-part": String(result.part),
      "x-export-total-parts": String(result.totalParts),
      "x-export-row-count": String(result.rowCount),
    },
  });
}

export function exportError(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { message: error.safeMessage },
      { status: error.status, headers: EXPORT_HEADERS },
    );
  return NextResponse.json(
    { message: "The export could not be generated." },
    { status: 500, headers: EXPORT_HEADERS },
  );
}
