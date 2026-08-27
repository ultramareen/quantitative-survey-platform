import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import pg from "pg";

const { Client } = pg;

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local test port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.quiet ? "pipe" : "inherit",
    });
    let stderr = "";
    if (options.quiet) child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function waitForDatabase(url, serverProcess) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `CockroachDB exited before it became ready (${serverProcess.exitCode})`,
      );
    }
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error("CockroachDB did not become ready");
}

async function schemaFingerprint(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name",
    );
    const definitions = [];
    for (const { table_name: tableName } of tables.rows) {
      const escaped = tableName.replaceAll('"', '""');
      const result = await client.query(`SHOW CREATE TABLE "${escaped}"`);
      definitions.push(result.rows[0]);
    }
    const enums = await client.query("SHOW ENUMS");
    return JSON.stringify({ definitions, enums: enums.rows });
  } finally {
    await client.end();
  }
}

function migrationUrl(runtimeUrl) {
  const parsedRuntimeUrl = new URL(runtimeUrl);
  const runtimeOptions = parsedRuntimeUrl.searchParams.get("options") ?? "";
  if (runtimeOptions.includes("create_table_with_schema_locked")) {
    throw new Error(
      "DATABASE_URL must not contain the migration-only schema-lock option",
    );
  }

  const separator = runtimeUrl.includes("?") ? "&" : "?";
  const url = `${runtimeUrl}${separator}options=-c%20create_table_with_schema_locked%3Doff`;
  if (
    new URL(url).searchParams.get("options") !==
    "-c create_table_with_schema_locked=off"
  ) {
    throw new Error("Migration URL is missing the required schema-lock option");
  }
  return url;
}

const cockroachBinary = process.env.COCKROACH_BINARY ?? "cockroach";
const storeDirectory = await mkdtemp(join(tmpdir(), "qsp-phase1-cockroach-"));
const sqlPort = await freePort();
const httpPort = await freePort();
const baseUrl = `postgresql://root@127.0.0.1:${sqlPort}`;
const defaultUrl = `${baseUrl}/defaultdb?sslmode=disable`;
const databaseUrlA = `${baseUrl}/qsp_phase1_a?sslmode=disable`;
const databaseUrlB = `${baseUrl}/qsp_phase1_b?sslmode=disable`;
const migrationDatabaseUrlA = migrationUrl(databaseUrlA);
const migrationDatabaseUrlB = migrationUrl(databaseUrlB);

const serverProcess = spawn(
  cockroachBinary,
  [
    "start-single-node",
    "--insecure",
    `--listen-addr=127.0.0.1:${sqlPort}`,
    `--advertise-addr=127.0.0.1:${sqlPort}`,
    `--http-addr=127.0.0.1:${httpPort}`,
    `--store=${storeDirectory}`,
    "--cache=256MiB",
    "--max-sql-memory=256MiB",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COCKROACH_SKIP_ENABLING_DIAGNOSTIC_REPORTING: "true",
      PATH:
        process.platform === "darwin" &&
        process.env.COCKROACH_TEST_NETSTAT_STUB === "1"
          ? `${resolve("scripts/test-support")}:${process.env.PATH ?? ""}`
          : process.env.PATH,
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);

let cockroachStderr = "";
serverProcess.stderr.on("data", (chunk) => (cockroachStderr += chunk));

try {
  await waitForDatabase(defaultUrl, serverProcess);
  const admin = new Client({ connectionString: defaultUrl });
  await admin.connect();
  await admin.query("CREATE DATABASE qsp_phase1_a");
  await admin.query("CREATE DATABASE qsp_phase1_b");
  await admin.end();

  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: {
      DATABASE_URL: databaseUrlA,
      MIGRATION_DATABASE_URL: migrationDatabaseUrlA,
    },
  });
  await run(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.database.config.ts"],
    { env: { DATABASE_URL: databaseUrlA } },
  );

  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: {
      DATABASE_URL: databaseUrlB,
      MIGRATION_DATABASE_URL: migrationDatabaseUrlB,
    },
  });
  await run(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.database.config.ts"],
    { env: { DATABASE_URL: databaseUrlB } },
  );

  const [fingerprintA, fingerprintB] = await Promise.all([
    schemaFingerprint(databaseUrlA),
    schemaFingerprint(databaseUrlB),
  ]);
  if (fingerprintA !== fingerprintB) {
    throw new Error("Repeated fresh migrations produced different schemas");
  }

  console.log(
    "Fresh migration schemas are deterministic and both invariant suites passed.",
  );
} catch (error) {
  if (cockroachStderr) console.error(cockroachStderr);
  throw error;
} finally {
  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    if (serverProcess.exitCode !== null) resolve();
    else serverProcess.once("exit", resolve);
  });
  await rm(storeDirectory, { recursive: true, force: true });
}
