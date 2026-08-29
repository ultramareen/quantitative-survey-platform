import {
  decryptBackupArchive,
  encryptBackupArchive,
  parseBackupKey,
} from "../src/server/modules/maintenance/backup-archive";

const [operation, inputPath, outputPath] = process.argv.slice(2);
if (
  !operation ||
  !inputPath ||
  !outputPath ||
  !["encrypt", "decrypt"].includes(operation)
) {
  console.error(
    "Usage: pnpm backup:archive <encrypt|decrypt> <input> <output>",
  );
  process.exitCode = 2;
} else {
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  if (operation === "encrypt")
    await encryptBackupArchive(inputPath, outputPath, key);
  else await decryptBackupArchive(inputPath, outputPath, key);
  console.log(
    operation === "encrypt"
      ? "Authenticated backup archive created."
      : "Authenticated backup archive decrypted for an isolated restore drill.",
  );
}
