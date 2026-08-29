import pg from "pg";
import { verifyRestoredDatabase } from "../src/server/modules/maintenance/restore-verifier";

if (!process.env.RESTORE_DATABASE_URL)
  throw new Error(
    "RESTORE_DATABASE_URL is required; ordinary DATABASE_URL is intentionally ignored.",
  );
const pool = new pg.Pool({
  connectionString: process.env.RESTORE_DATABASE_URL,
  max: 2,
});
try {
  console.log(JSON.stringify(await verifyRestoredDatabase(pool)));
} finally {
  await pool.end();
}
