import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const nextRoot = join(process.cwd(), ".next");
const files = (
  await Promise.all(
    ["static", "server"].map((directory) =>
      filesUnder(join(nextRoot, directory)),
    ),
  )
).flat();
const sourceMaps = files.filter((file) => file.endsWith(".map"));
if (sourceMaps.length)
  throw new Error("Production build contains source maps.");

const forbiddenValues = [
  process.env.BETTER_AUTH_SECRET,
  process.env.DATABASE_URL,
  process.env.MIGRATION_DATABASE_URL,
  process.env.RATE_LIMIT_HMAC_KEY,
  process.env.RESEND_API_KEY,
  process.env.QSP_SMOKE_TOKEN,
  ...Object.entries(process.env)
    .filter(([name]) =>
      /^(?:PII_ENCRYPTION_KEY|PHONE_LOOKUP_HMAC_KEY)_V\d+$/.test(name),
    )
    .map(([, value]) => value),
].filter((value): value is string => Boolean(value));

for (const file of files) {
  if (![".js", ".json", ".html", ".txt"].includes(extname(file))) continue;
  const content = await readFile(file, "utf8");
  if (extname(file) === ".js" && content.includes("sourceMappingURL="))
    throw new Error("Production JavaScript contains an embedded source map.");
  if (forbiddenValues.some((value) => content.includes(value)))
    throw new Error("Production build contains a configured secret value.");
}
process.stdout.write(
  `Production artifact scan passed (${files.length} files, no source maps or configured secrets).\n`,
);

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
