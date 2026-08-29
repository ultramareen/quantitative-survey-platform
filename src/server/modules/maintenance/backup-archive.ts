import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, open, rename, rm } from "node:fs/promises";

const MAGIC = Buffer.from("QSPBACKUP1", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function parseBackupKey(value: string | undefined): Buffer {
  if (!value)
    throw new Error(
      "BACKUP_ENCRYPTION_KEY is required on the controlled backup machine.",
    );
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes.",
    );
  return key;
}

export async function encryptBackupArchive(
  inputPath: string,
  outputPath: string,
  key: Buffer,
): Promise<void> {
  const plaintext = await readFileSafely(inputPath);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(MAGIC);
  await writePrivateAtomic(
    outputPath,
    Buffer.concat([
      MAGIC,
      nonce,
      cipher.update(plaintext),
      cipher.final(),
      cipher.getAuthTag(),
    ]),
  );
}

export async function decryptBackupArchive(
  inputPath: string,
  outputPath: string,
  key: Buffer,
): Promise<void> {
  const encrypted = await readFileSafely(inputPath);
  if (
    encrypted.length <= MAGIC.length + NONCE_BYTES + TAG_BYTES ||
    !encrypted.subarray(0, MAGIC.length).equals(MAGIC)
  )
    throw new Error("Invalid encrypted backup archive.");
  const nonceStart = MAGIC.length;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    encrypted.subarray(nonceStart, nonceStart + NONCE_BYTES),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(encrypted.subarray(-TAG_BYTES));
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(encrypted.subarray(nonceStart + NONCE_BYTES, -TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Backup authentication failed; no plaintext was written.");
  }
  await writePrivateAtomic(outputPath, plaintext);
}

async function readFileSafely(path: string): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
async function writePrivateAtomic(path: string, data: Buffer): Promise<void> {
  const temporary = `${path}.partial-${process.pid}`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
