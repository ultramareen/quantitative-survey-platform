import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  requireTrustedMutation,
  surveyError,
} from "@/server/modules/surveys/http";
import { getSurveyService } from "@/server/modules/surveys/runtime";
import { surveySchema } from "@/server/modules/surveys/schema";

type Context = { params: Promise<{ surveyId: string }> };
export async function GET(_: NextRequest, context: Context) {
  try {
    return NextResponse.json({
      survey: await getSurveyService().view(
        await getCurrentEmployee(),
        (await context.params).surveyId,
      ),
    });
  } catch (error) {
    return surveyError(error);
  }
}
export async function PUT(request: NextRequest, context: Context) {
  try {
    requireTrustedMutation(request);
    await getSurveyService().update(
      await getCurrentEmployee(),
      (await context.params).surveyId,
      surveySchema.parse(await request.json()),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return surveyError(error);
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    requireTrustedMutation(request);
    return NextResponse.json(
      await getSurveyService().remove(
        await getCurrentEmployee(),
        (await context.params).surveyId,
      ),
    );
  } catch (error) {
    return surveyError(error);
  }
}
