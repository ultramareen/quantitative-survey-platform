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
        brevoApiKey: environment.BREVO_API_KEY,
        brevoFromEmail: environment.BREVO_FROM_EMAIL,
        brevoFromName: environment.BREVO_FROM_NAME,
      }),
      undefined,
      environment.MAIL_TRANSPORT === "brevo",
    );
  }
  return service;
}
