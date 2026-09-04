import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import { infrastructureError } from "@/server/modules/infrastructure/http";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";

export const dynamic = "force-dynamic";
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

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}
