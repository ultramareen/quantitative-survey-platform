import nextEnvironment from "@next/env";

import { parseServerEnvironment } from "../src/server/config/schema";
import { AppError } from "../src/server/errors/app-error";

nextEnvironment.loadEnvConfig(process.cwd());

try {
  parseServerEnvironment(process.env);
  process.stdout.write("Server configuration is valid.\n");
} catch (error) {
  const message =
    error instanceof AppError
      ? error.message
      : "Server configuration validation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
