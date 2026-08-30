import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { createAuthMailAdapter } from "@/server/modules/auth/mail";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";
import { PgEmployeeManagementRepository } from "./repository";
import { EmployeeManagementService } from "./service";

let service: EmployeeManagementService | undefined;
export function getEmployeeManagementService() {
  if (!service) {
    const env = getServerEnvironment();
    service = new EmployeeManagementService(
      new PgEmployeeManagementRepository(),
      createAuthMailAdapter({
        transport: env.MAIL_TRANSPORT,
        localMailboxPath: env.LOCAL_MAILBOX_PATH,
        brevoApiKey: env.BREVO_API_KEY,
        brevoFromEmail: env.BREVO_FROM_EMAIL,
        brevoFromName: env.BREVO_FROM_NAME,
        onBrevoDelivered: () =>
          getInfrastructureService().recordBrevoDelivery(),
      }),
      env.APP_ORIGIN,
    );
  }
  return service;
}
