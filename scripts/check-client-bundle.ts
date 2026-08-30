import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const staticDirectory = join(process.cwd(), ".next", "static");
const forbiddenValues = [
  process.env.BETTER_AUTH_SECRET,
  process.env.DATABASE_URL,
  process.env.RATE_LIMIT_HMAC_KEY,
  process.env.BREVO_API_KEY,
  process.env.QSP_BOOTSTRAP_PASSWORD,
  ...Object.entries(process.env)
    .filter(([name]) =>
      /^(?:PII_ENCRYPTION_KEY|PHONE_LOOKUP_HMAC_KEY)_V\d+$/.test(name),
    )
    .map(([, value]) => value),
  "@prisma/client",
  "QSP_AES_256_GCM",
  "QSP_PHONE_LOOKUP_HMAC_V1",
  "QSP_RATE_LIMIT_HMAC_V1",
  "QSP_BOOTSTRAP_PASSWORD",
  "QSP_BOOTSTRAP_EMAIL",
  "QSP_BOOTSTRAP_DISPLAY_NAME",
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
