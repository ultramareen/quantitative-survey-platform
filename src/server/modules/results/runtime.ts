import "server-only";
import { getServerEnvironment } from "@/server/config/env";
import { getDatabasePool } from "@/server/database/pool";
import { ResultsService } from "./service";
let service: ResultsService | undefined;
export function getResultsService() {
  return (service ??= new ResultsService(
    getDatabasePool(),
    getServerEnvironment().cryptography,
  ));
}
