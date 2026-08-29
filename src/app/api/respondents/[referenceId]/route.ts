import { NextResponse } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  PII_RESPONSE_HEADERS,
  respondentAccessError,
} from "@/server/modules/respondents/internal-http";
import { getInternalRespondentService } from "@/server/modules/respondents/internal-runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ referenceId: string }> },
) {
  try {
    return NextResponse.json(
      await getInternalRespondentService().detail(
        await getCurrentEmployee(),
        (await context.params).referenceId,
      ),
      { headers: PII_RESPONSE_HEADERS },
    );
  } catch (error) {
    return respondentAccessError(error);
  }
}
