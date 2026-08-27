import "server-only";

import { Pool } from "pg";

import { getServerEnvironment } from "@/server/config/env";

const globalDatabase = globalThis as typeof globalThis & {
  quantitativeSurveyPool?: Pool;
};

export function getDatabasePool(): Pool {
  globalDatabase.quantitativeSurveyPool ??= new Pool({
    connectionString: getServerEnvironment().DATABASE_URL,
    max: 10,
  });
  return globalDatabase.quantitativeSurveyPool;
}
