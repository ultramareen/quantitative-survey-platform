import { z } from "zod";
import type { NextRequest } from "next/server";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  infrastructureError,
  requireTrustedMutation,
} from "@/server/modules/infrastructure/http";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";

export const dynamic = "force-dynamic";
const reconciliation = z
  .object({
    provider: z.enum(["NETLIFY", "COCKROACH", "RESEND"]),
    quota: z.string().min(1).max(128),
    period: z.string().min(1).max(64),
    used: z.number().nonnegative(),
    limit: z.number().positive(),
    collectedAt: z.coerce.date(),
  })
  .strict();

export async function GET() {
  try {
    const body = await getInfrastructureService().adminView(
      await getCurrentEmployee(),
    );
    return Response.json(body, { headers: privateHeaders() });
  } catch (error) {
    return infrastructureError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireTrustedMutation(request);
    const input = reconciliation.parse(await request.json());
    await getInfrastructureService().reconcile(
      await getCurrentEmployee(),
      input,
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
