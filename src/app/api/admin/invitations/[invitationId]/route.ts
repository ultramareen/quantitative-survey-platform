import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

const schema = z.object({ action: z.enum(["resend", "disable"]) }).strict();
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    requireTrustedMutation(request);
    const actor = await getCurrentEmployee();
    const { invitationId } = await context.params;
    const { action } = schema.parse(await request.json());
    const service = getEmployeeManagementService();
    const result =
      action === "resend"
        ? await service.resend(actor, invitationId)
        : await service.disableInvitation(actor, invitationId);
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    return managementError(error);
  }
}
