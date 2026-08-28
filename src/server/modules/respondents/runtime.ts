import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { PgRespondentRepository } from "./repository";
import { PublicRespondentService } from "./service";

let service: PublicRespondentService | undefined;
export function getPublicRespondentService() {
  service ??= new PublicRespondentService(
    new PgRespondentRepository(),
    getServerEnvironment().cryptography,
  );
  return service;
}
