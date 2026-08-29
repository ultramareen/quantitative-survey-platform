import "server-only";

import { getServerEnvironment } from "@/server/config/env";
import { ExportRepository } from "./repository";
import { ExportService } from "./service";

let service: ExportService | undefined;
export function getExportService() {
  return (service ??= new ExportService(
    new ExportRepository(),
    getServerEnvironment().cryptography,
  ));
}
