import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { PgInternalRespondentRepository } from "./internal-repository";
import { InternalRespondentService } from "./internal-service";

let service: InternalRespondentService | undefined;
export function getInternalRespondentService() {
  return (service ??= new InternalRespondentService(
    new PgInternalRespondentRepository(),
    getServerEnvironment().cryptography,
  ));
}
