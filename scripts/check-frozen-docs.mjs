import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const manifest = await readFile(resolve(root, ".frozen-docs.sha256"), "utf8");
const entries = manifest
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
    if (!match) throw new Error("Frozen-document manifest is malformed.");
    return { expectedHash: match[1], relativePath: match[2] };
  });

for (const { expectedHash, relativePath } of entries) {
  const contents = await readFile(resolve(root, relativePath));
  const actualHash = createHash("sha256").update(contents).digest("hex");
  const matches = timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );

  if (!matches) {
    process.stderr.write(
      `Frozen document integrity check failed: ${relativePath}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  process.stdout.write(
    `Frozen document integrity check passed (${entries.length} files).\n`,
  );
}
