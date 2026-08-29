import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { parseJsonRequest } from "@/server/http/request-validation";
import {
  requireTrustedMutation,
  surveyError,
} from "@/server/modules/surveys/http";
import { getSurveyService } from "@/server/modules/surveys/runtime";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("duplicate") }).strict(),
  z
    .object({
      action: z.literal("transition"),
      target: z.enum(["ACTIVE", "PENDING_CAPACITY", "COMPLETED"]),
      stateVersion: z.number().int().positive(),
    })
    .strict(),
]);
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string }> },
) {
  try {
    requireTrustedMutation(request);
    const body = await parseJsonRequest(request, schema, 4_096);
    const id = (await context.params).surveyId;
    const service = getSurveyService();
    const result =
      body.action === "duplicate"
        ? await service.duplicate(await getCurrentEmployee(), id)
        : await service.transition(
            await getCurrentEmployee(),
            id,
            body.target,
            body.stateVersion,
          );
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    return surveyError(error);
  }
}
