import { z } from "zod";
import type { NextRequest } from "next/server";
import { parseJsonRequest } from "@/server/http/request-validation";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  infrastructureError,
  requireTrustedMutation,
} from "@/server/modules/infrastructure/http";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause-all") }).strict(),
  z
    .object({
      action: z.literal("switch"),
      selectedPublicId: z.string().min(1).max(255),
    })
    .strict(),
]);

export async function POST(request: NextRequest) {
  try {
    requireTrustedMutation(request);
    const input = await parseJsonRequest(request, actionSchema, 4_096);
    const service = getInfrastructureService();
    if (input.action === "pause-all")
      return Response.json(
        { affected: await service.pauseAll(await getCurrentEmployee()) },
        { headers: privateHeaders() },
      );
    await service.switchActive(
      await getCurrentEmployee(),
      input.selectedPublicId,
    );
    return new Response(null, { status: 204, headers: privateHeaders() });
  } catch (error) {
    return infrastructureError(error);
  }
}

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}
