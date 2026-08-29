import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonRequest } from "@/server/http/request-validation";
import { getCurrentEmployee } from "@/server/modules/auth/current-employee";
import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
import { getEmployeeManagementService } from "@/server/modules/employees/runtime";

const createSchema = z
  .object({
    email: z.string().max(320),
    role: z.enum(["PRODUCT_MANAGER", "RESEARCHER", "ADMIN"]),
  })
  .strict();

export async function GET() {
  try {
    return NextResponse.json({
      employees: await getEmployeeManagementService().list(
        await getCurrentEmployee(),
      ),
    });
  } catch (error) {
    return managementError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireTrustedMutation(request);
    const body = await parseJsonRequest(request, createSchema, 4_096);
    return NextResponse.json(
      await getEmployeeManagementService().createInvitation(
        await getCurrentEmployee(),
        body,
      ),
      { status: 201 },
    );
  } catch (error) {
    return managementError(error);
  }
}
