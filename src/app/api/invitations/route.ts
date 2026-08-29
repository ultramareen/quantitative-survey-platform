import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonRequest } from "@/server/http/request-validation";
import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

const acceptSchema = z
  .object({
    token: z.string().max(256),
    displayName: z.string().max(200),
    password: z.string().max(1024),
    passwordConfirmation: z.string().max(1024),
  })
  .strict();
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const invitation = await getEmployeeManagementService().preview(token);
    return invitation
      ? NextResponse.json({ invitation })
      : NextResponse.json(
          { message: "This invitation is invalid, expired, or unavailable." },
          { status: 404 },
        );
  } catch (error) {
    return managementError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireTrustedMutation(request);
    const body = await parseJsonRequest(request, acceptSchema, 4_096);
    await getEmployeeManagementService().accept(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return managementError(error);
  }
}
