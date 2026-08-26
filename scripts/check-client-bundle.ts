import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const staticDirectory = join(process.cwd(), ".next", "static");
const forbiddenValues = [
  process.env.BETTER_AUTH_SECRET,
  process.env.DATABASE_URL,
  "@prisma/client",
].filter((value): value is string => Boolean(value));

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(path) : [path];
      }),
    )
  ).flat();
}

const files = await filesUnder(staticDirectory);
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const forbidden of forbiddenValues) {
    if (content.includes(forbidden)) {
      throw new Error(
        `Client bundle contains forbidden server value or module in ${file}`,
      );
    }
  }
}

process.stdout.write(
  `Client bundle scan passed (${files.length} files inspected).\n`,
);
