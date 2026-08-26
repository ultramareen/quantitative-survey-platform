import "server-only";

import { parseServerEnvironment } from "@/server/config/schema";

let cachedEnvironment: ReturnType<typeof parseServerEnvironment> | undefined;

export function getServerEnvironment() {
  cachedEnvironment ??= parseServerEnvironment(process.env);
  return cachedEnvironment;
}
