import { getServerEnvironment } from "@/server/config/env";
import { getDatabasePool } from "@/server/database/pool";
import {
  authorizeSmokeCheck,
  ProductionHealthService,
} from "@/server/modules/infrastructure/health";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function GET(request: Request) {
  const environment = getServerEnvironment();
  if (
    !authorizeSmokeCheck(
      request.headers.get("authorization"),
      environment.QSP_SMOKE_TOKEN,
    )
  )
    return Response.json({ status: "unavailable" }, { status: 404, headers });
  const ready = await new ProductionHealthService(getDatabasePool()).ready();
  return Response.json(
    { status: ready ? "ok" : "unavailable" },
    { status: ready ? 200 : 503, headers },
  );
}
