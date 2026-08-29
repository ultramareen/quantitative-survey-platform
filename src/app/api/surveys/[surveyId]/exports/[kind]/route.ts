import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors/app-error";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { exportError, exportResponse } from "@/server/modules/exports/http";
import { getExportService } from "@/server/modules/exports/runtime";
import type { ExportKind } from "@/server/modules/exports/types";

const KINDS = new Set<ExportKind>([
  "aggregate",
  "current",
  "archived",
  "free-text",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string; kind: string }> },
) {
  try {
    const { surveyId, kind } = await context.params;
    if (!KINDS.has(kind as ExportKind)) throw invalid();
    for (const key of request.nextUrl.searchParams.keys())
      if (!["snapshotNumber", "questionPosition", "part"].includes(key))
        throw invalid();
    return exportResponse(
      await getExportService().create(await getCurrentEmployee(), surveyId, {
        kind: kind as ExportKind,
        snapshotNumber: number(request, "snapshotNumber"),
        questionPosition: number(request, "questionPosition"),
        part: number(request, "part") ?? 1,
      }),
    );
  } catch (error) {
    return exportError(error);
  }
}

function number(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw invalid();
  return parsed;
}

function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_EXPORT",
    message: "Invalid export request.",
    safeMessage: "The export request is invalid.",
    status: 400,
  });
}
