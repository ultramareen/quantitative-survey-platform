import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { createInfrastructureMailAdapter } from "./mail";
import { PgInfrastructureRepository } from "./repository";
import { InfrastructureService } from "./service";

let service: InfrastructureService | undefined;

export function getInfrastructureService() {
  if (!service) {
    const environment = getServerEnvironment();
    service = new InfrastructureService(
      new PgInfrastructureRepository(),
      createInfrastructureMailAdapter({
        transport: environment.MAIL_TRANSPORT,
        localMailboxPath: environment.LOCAL_MAILBOX_PATH,
        resendApiKey: environment.RESEND_API_KEY,
        resendFromEmail: environment.RESEND_FROM_EMAIL,
      }),
      undefined,
      environment.MAIL_TRANSPORT === "resend",
    );
  }
  return service;
}
