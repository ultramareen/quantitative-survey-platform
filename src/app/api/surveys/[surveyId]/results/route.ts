import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { getResultsService } from "@/server/modules/results/runtime";
import {
  requireTrustedMutation,
  surveyError,
} from "@/server/modules/surveys/http";
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ surveyId: string }> },
) {
  try {
    return NextResponse.json(
      await getResultsService().history(
        await getCurrentEmployee(),
        (await context.params).surveyId,
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return surveyError(error);
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string }> },
) {
  try {
    requireTrustedMutation(request);
    if (Number(request.headers.get("content-length") ?? 0) > 1024)
      return NextResponse.json(
        { message: "The request is too large." },
        { status: 413 },
      );
    return NextResponse.json(
      await getResultsService().calculate(
        await getCurrentEmployee(),
        (await context.params).surveyId,
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return surveyError(error);
  }
}
