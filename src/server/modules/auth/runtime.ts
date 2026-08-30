import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { createAuthMailAdapter } from "./mail";
import { getInfrastructureService } from "@/server/modules/infrastructure/runtime";
import { AuthRateLimiter } from "./rate-limit";
import { PgAuthRepository } from "./repository";
import { EmployeeAuthService } from "./service";

let service: EmployeeAuthService | undefined;

export function getEmployeeAuthService(): EmployeeAuthService {
  if (!service) {
    const environment = getServerEnvironment();
    const repository = new PgAuthRepository();
    service = new EmployeeAuthService(
      repository,
      new AuthRateLimiter(
        repository,
        environment.cryptography.rateLimitHmacKey,
      ),
      createAuthMailAdapter({
        transport: environment.MAIL_TRANSPORT,
        localMailboxPath: environment.LOCAL_MAILBOX_PATH,
        brevoApiKey: environment.BREVO_API_KEY,
        brevoFromEmail: environment.BREVO_FROM_EMAIL,
        brevoFromName: environment.BREVO_FROM_NAME,
        onBrevoDelivered: () =>
          getInfrastructureService().recordBrevoDelivery(),
      }),
      environment.APP_ORIGIN,
    );
  }
  return service;
}
