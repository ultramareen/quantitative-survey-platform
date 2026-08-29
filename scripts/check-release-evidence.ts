import { readFile } from "node:fs/promises";
import { validateProductionReleaseEvidence } from "../src/server/modules/infrastructure/release-evidence";

const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: pnpm release:evidence <company-controlled-evidence.json>",
  );
validateProductionReleaseEvidence(JSON.parse(await readFile(path, "utf8")));
console.log(
  "Production release evidence is complete, current, and safe-reference only.",
);
