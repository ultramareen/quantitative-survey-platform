import { readFile, rename, writeFile } from "node:fs/promises";
import pg from "pg";
import { parsePiiEncryptionKeyRegistry } from "../src/server/modules/cryptography/key-registry";
import {
  PgReencryptionMaintenanceService,
  type ReencryptionCheckpoint,
} from "../src/server/modules/cryptography/rotation";

const maintenanceUrl = process.env.MAINTENANCE_DATABASE_URL;
const fromVersion = Number(process.env.ROTATE_FROM_VERSION);
const toVersion = Number(process.env.ROTATE_TO_VERSION);
const batchSize = Number(process.env.ROTATE_BATCH_SIZE ?? "100");
const checkpointPath = process.env.ROTATION_CHECKPOINT_PATH;
if (!maintenanceUrl || !checkpointPath)
  throw new Error(
    "MAINTENANCE_DATABASE_URL and ROTATION_CHECKPOINT_PATH are required.",
  );

let checkpoint: ReencryptionCheckpoint | undefined;
try {
  checkpoint = JSON.parse(
    await readFile(checkpointPath, "utf8"),
  ) as ReencryptionCheckpoint;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const pool = new pg.Pool({ connectionString: maintenanceUrl, max: 1 });
try {
  const service = new PgReencryptionMaintenanceService(
    pool,
    parsePiiEncryptionKeyRegistry(process.env),
  );
  const result = await service.reencryptBatch({
    fromVersion,
    toVersion,
    batchSize,
    checkpoint,
  });
  if (result.complete)
    console.log(
      "PII key rotation is complete. Verify counts before retiring the old key.",
    );
  else {
    const temporary = `${checkpointPath}.partial-${process.pid}`;
    await writeFile(temporary, JSON.stringify(result.checkpoint) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, checkpointPath);
    console.log(`Rotated ${result.processed} records; checkpoint saved.`);
  }
} finally {
  await pool.end();
}
