import "server-only";
import { getServerEnvironment } from "@/server/config/env";
import { getDatabasePool } from "@/server/database/pool";
import { PublicAttemptService } from "./service";
let service: PublicAttemptService | undefined;
export function getPublicAttemptService() {
  return (service ??= new PublicAttemptService(
    getDatabasePool(),
    getServerEnvironment().cryptography,
  ));
}
