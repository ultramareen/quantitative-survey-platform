import type { NextRequest } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { surveyError } from "@/server/modules/surveys/http";
import { getResultsService } from "@/server/modules/results/runtime";
import { generateResultsPdf } from "@/server/modules/results/pdf-report";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string }> },
) {
  try {
    const snapshotNumber = Number(
      request.nextUrl.searchParams.get("snapshotNumber"),
    );
    const report = await getResultsService().report(
      await getCurrentEmployee(),
      (await context.params).surveyId,
      snapshotNumber,
    );
    const pdf = await generateResultsPdf(report);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="survey-results-${snapshotNumber}.pdf"`,
        "cache-control": "private, no-store, max-age=0",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return surveyError(error);
  }
}
