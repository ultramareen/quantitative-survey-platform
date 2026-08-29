import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decryptBackupArchive,
  encryptBackupArchive,
  parseBackupKey,
} from "@/server/modules/maintenance/backup-archive";

describe("authenticated backup archives", () => {
  it("round-trips a complete archive without plaintext in the encrypted output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qsp-backup-test-"));
    const source = join(directory, "logical.tar");
    const encrypted = join(directory, "logical.qspbak");
    const restored = join(directory, "restored.tar");
    const plaintext = Buffer.from("synthetic-name-canary\nschema-and-data");
    const key = Buffer.alloc(32, 41);
    await writeFile(source, plaintext);
    await encryptBackupArchive(source, encrypted, key);
    const encryptedBytes = await readFile(encrypted);
    expect(encryptedBytes.includes(plaintext)).toBe(false);
    expect((await stat(encrypted)).mode & 0o777).toBe(0o600);
    await decryptBackupArchive(encrypted, restored, key);
    expect(await readFile(restored)).toEqual(plaintext);
  });

  it("rejects tampering before writing plaintext", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qsp-backup-test-"));
    const source = join(directory, "logical.tar");
    const encrypted = join(directory, "logical.qspbak");
    const restored = join(directory, "restored.tar");
    const key = Buffer.alloc(32, 42);
    await writeFile(source, "synthetic archive");
    await encryptBackupArchive(source, encrypted, key);
    const damaged = await readFile(encrypted);
    damaged[damaged.length - 17] ^= 1;
    await writeFile(encrypted, damaged);
    await expect(
      decryptBackupArchive(encrypted, restored, key),
    ).rejects.toThrow("authentication failed");
    await expect(readFile(restored)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires a canonical independent 256-bit key", () => {
    expect(
      parseBackupKey(Buffer.alloc(32, 43).toString("base64")),
    ).toHaveLength(32);
    expect(() => parseBackupKey(undefined)).toThrow(
      "controlled backup machine",
    );
    expect(() => parseBackupKey(Buffer.alloc(31).toString("base64"))).toThrow(
      "32 bytes",
    );
  });
});
