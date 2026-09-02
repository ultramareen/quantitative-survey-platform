import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonRequest } from "@/server/http/request-validation";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resend") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z
    .object({
      action: z.literal("change-role"),
      role: z.enum(["PRODUCT_MANAGER", "RESEARCHER", "ADMIN"]),
    })
    .strict(),
]);
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    requireTrustedMutation(request);
    const actor = await getCurrentEmployee();
    const { invitationId } = await context.params;
    const body = await parseJsonRequest(request, schema, 1_024);
    const { action } = body;
    const service = getEmployeeManagementService();
    const result =
      action === "resend"
        ? await service.resend(actor, invitationId)
        : action === "cancel"
          ? await service.disableInvitation(actor, invitationId)
          : await service.changeInvitationRole(actor, invitationId, body.role);
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    return managementError(error);
  }
}
