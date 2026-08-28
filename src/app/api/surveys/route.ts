import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  requireTrustedMutation,
  surveyError,
} from "@/server/modules/surveys/http";
import { getSurveyService } from "@/server/modules/surveys/runtime";
import { surveySchema } from "@/server/modules/surveys/schema";

export async function GET() {
  try {
    return NextResponse.json({
      surveys: await getSurveyService().list(await getCurrentEmployee()),
    });
  } catch (error) {
    return surveyError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireTrustedMutation(request);
    const result = await getSurveyService().create(
      await getCurrentEmployee(),
      surveySchema.parse(await request.json()),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return surveyError(error);
  }
}
