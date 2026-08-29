import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonRequest } from "@/server/http/request-validation";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("change-role"),
      role: z.enum(["PRODUCT_MANAGER", "RESEARCHER", "ADMIN"]),
    })
    .strict(),
  z.object({ action: z.literal("disable") }).strict(),
  z.object({ action: z.literal("reenable") }).strict(),
]);
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    requireTrustedMutation(request);
    const actor = await getCurrentEmployee();
    const { userId } = await context.params;
    const body = await parseJsonRequest(request, bodySchema, 4_096);
    const service = getEmployeeManagementService();
    if (body.action === "change-role")
      await service.changeRole(actor, userId, body.role);
    else if (body.action === "disable")
      await service.disableEmployee(actor, userId);
    else await service.reenableEmployee(actor, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return managementError(error);
  }
}
