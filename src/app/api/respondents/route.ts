import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/server/errors/app-error";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  PII_RESPONSE_HEADERS,
  respondentAccessError,
} from "@/server/modules/respondents/internal-http";
import { getInternalRespondentService } from "@/server/modules/respondents/internal-runtime";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    for (const key of query.keys()) {
      if (!["referenceId", "surveyId", "page", "pageSize"].includes(key))
        throw invalidQuery();
    }
    return NextResponse.json(
      await getInternalRespondentService().list(await getCurrentEmployee(), {
        referenceId: query.get("referenceId") ?? undefined,
        surveyId: query.get("surveyId") ?? undefined,
        page: optionalNumber(query.get("page")),
        pageSize: optionalNumber(query.get("pageSize")),
      }),
      { headers: PII_RESPONSE_HEADERS },
    );
  } catch (error) {
    return respondentAccessError(error);
  }
}

function optionalNumber(value: string | null) {
  return value === null ? undefined : Number(value);
}

function invalidQuery() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_RESPONDENT_QUERY",
    message: "Unsupported respondent query filter.",
    safeMessage: "The respondent query is invalid.",
    status: 400,
  });
}
