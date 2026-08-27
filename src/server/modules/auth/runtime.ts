import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { createAuthMailAdapter } from "./mail";
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
        resendApiKey: environment.RESEND_API_KEY,
        resendFromEmail: environment.RESEND_FROM_EMAIL,
      }),
      environment.APP_ORIGIN,
    );
  }
  return service;
}
