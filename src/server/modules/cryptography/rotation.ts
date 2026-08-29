import "server-only";

import type { Pool, PoolClient } from "pg";
import { decryptEnvelope, encryptEnvelope } from "./aes-gcm";
import type { VersionedKeyRegistry } from "./key-registry";

export const reencryptionStages = [
  "RESPONDENTS",
  "ATTEMPTS",
  "RESULTS_SNAPSHOTS",
] as const;
export type ReencryptionStage = (typeof reencryptionStages)[number];
export type ReencryptionCheckpoint = {
  stage: ReencryptionStage;
  afterId?: string;
};

export interface ReencryptionMaintenancePort<Checkpoint> {
  reencryptBatch(input: {
    fromVersion: number;
    toVersion: number;
    checkpoint?: Checkpoint;
    batchSize: number;
  }): Promise<{
    checkpoint?: Checkpoint;
    processed: number;
    complete: boolean;
  }>;
}

/** Maintenance-role only. Never construct this service from an HTTP runtime. */
export class PgReencryptionMaintenanceService implements ReencryptionMaintenancePort<ReencryptionCheckpoint> {
  constructor(
    private readonly pool: Pool,
    private readonly keys: VersionedKeyRegistry,
  ) {}

  async reencryptBatch(input: {
    fromVersion: number;
    toVersion: number;
    checkpoint?: ReencryptionCheckpoint;
    batchSize: number;
  }) {
    validateInput(input, this.keys);
    let checkpoint = input.checkpoint ?? { stage: "RESPONDENTS" as const };
    while (true) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await this.processStage(client, checkpoint, input);
        await client.query("COMMIT");
        if (result.processed > 0) return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const next = nextStage(checkpoint.stage);
      if (!next) return { processed: 0, complete: true as const };
      checkpoint = { stage: next };
    }
  }

  private async processStage(
    client: PoolClient,
    checkpoint: ReencryptionCheckpoint,
    input: { fromVersion: number; toVersion: number; batchSize: number },
  ): Promise<{
    checkpoint: ReencryptionCheckpoint;
    processed: number;
    complete: false;
  }> {
    if (checkpoint.stage === "RESPONDENTS") {
      const rows = await client.query<RespondentRow>(
        `SELECT id,name_ciphertext,name_nonce,name_key_version,phone_ciphertext,phone_nonce,phone_key_version FROM respondents WHERE id > $1 AND (name_key_version=$2 OR phone_key_version=$2) ORDER BY id LIMIT $3 FOR UPDATE`,
        [checkpoint.afterId ?? NIL_UUID, input.fromVersion, input.batchSize],
      );
      for (const row of rows.rows)
        await rotateRespondent(client, row, input, this.keys);
      return batchResult(checkpoint.stage, rows.rows);
    }
    if (checkpoint.stage === "ATTEMPTS") {
      const rows = await client.query<AttemptRow>(
        `SELECT id,payload_ciphertext,payload_nonce,payload_key_version FROM response_attempts WHERE id > $1 AND payload_key_version=$2 ORDER BY id LIMIT $3 FOR UPDATE`,
        [checkpoint.afterId ?? NIL_UUID, input.fromVersion, input.batchSize],
      );
      for (const row of rows.rows) {
        const envelope = rotate(
          row.id,
          "ANSWER_PAYLOAD",
          row.payload_ciphertext,
          row.payload_nonce,
          row.payload_key_version,
          this.keys,
        );
        await client.query(
          `UPDATE response_attempts SET payload_ciphertext=$2,payload_nonce=$3,payload_key_version=$4 WHERE id=$1 AND payload_key_version=$5`,
          [
            row.id,
            envelope.sealedPayload,
            envelope.nonce,
            input.toVersion,
            input.fromVersion,
          ],
        );
      }
      return batchResult(checkpoint.stage, rows.rows);
    }
    const rows = await client.query<SnapshotRow>(
      `SELECT id,free_text_ciphertext,free_text_nonce,free_text_key_version FROM results_snapshots WHERE id > $1 AND free_text_key_version=$2 ORDER BY id LIMIT $3 FOR UPDATE`,
      [checkpoint.afterId ?? NIL_UUID, input.fromVersion, input.batchSize],
    );
    for (const row of rows.rows) {
      const envelope = rotate(
        row.id,
        "RESULT_FREE_TEXT_LABELS",
        row.free_text_ciphertext,
        row.free_text_nonce,
        row.free_text_key_version,
        this.keys,
      );
      await client.query(
        `UPDATE results_snapshots SET free_text_ciphertext=$2,free_text_nonce=$3,free_text_key_version=$4 WHERE id=$1 AND free_text_key_version=$5`,
        [
          row.id,
          envelope.sealedPayload,
          envelope.nonce,
          input.toVersion,
          input.fromVersion,
        ],
      );
    }
    return batchResult(checkpoint.stage, rows.rows);
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
type RespondentRow = {
  id: string;
  name_ciphertext: Buffer | null;
  name_nonce: Buffer | null;
  name_key_version: number | null;
  phone_ciphertext: Buffer | null;
  phone_nonce: Buffer | null;
  phone_key_version: number | null;
};
type AttemptRow = {
  id: string;
  payload_ciphertext: Buffer;
  payload_nonce: Buffer;
  payload_key_version: number;
};
type SnapshotRow = {
  id: string;
  free_text_ciphertext: Buffer;
  free_text_nonce: Buffer;
  free_text_key_version: number;
};

async function rotateRespondent(
  client: PoolClient,
  row: RespondentRow,
  input: { fromVersion: number; toVersion: number },
  keys: VersionedKeyRegistry,
) {
  const name =
    row.name_key_version === input.fromVersion &&
    row.name_ciphertext &&
    row.name_nonce
      ? rotate(
          row.id,
          "RESPONDENT_NAME",
          row.name_ciphertext,
          row.name_nonce,
          row.name_key_version,
          keys,
        )
      : undefined;
  const phone =
    row.phone_key_version === input.fromVersion &&
    row.phone_ciphertext &&
    row.phone_nonce
      ? rotate(
          row.id,
          "RESPONDENT_PHONE",
          row.phone_ciphertext,
          row.phone_nonce,
          row.phone_key_version,
          keys,
        )
      : undefined;
  await client.query(
    `UPDATE respondents SET name_ciphertext=COALESCE($2,name_ciphertext),name_nonce=COALESCE($3,name_nonce),name_key_version=CASE WHEN $2::BYTES IS NULL THEN name_key_version ELSE $4 END,phone_ciphertext=COALESCE($5,phone_ciphertext),phone_nonce=COALESCE($6,phone_nonce),phone_key_version=CASE WHEN $5::BYTES IS NULL THEN phone_key_version ELSE $4 END WHERE id=$1 AND (name_key_version=$7 OR phone_key_version=$7)`,
    [
      row.id,
      name?.sealedPayload ?? null,
      name?.nonce ?? null,
      input.toVersion,
      phone?.sealedPayload ?? null,
      phone?.nonce ?? null,
      input.fromVersion,
    ],
  );
}

function rotate(
  recordId: string,
  purpose:
    | "RESPONDENT_NAME"
    | "RESPONDENT_PHONE"
    | "ANSWER_PAYLOAD"
    | "RESULT_FREE_TEXT_LABELS",
  ciphertext: Buffer,
  nonce: Buffer,
  keyVersion: number,
  keys: VersionedKeyRegistry,
) {
  const plaintext = decryptEnvelope(
    { envelopeVersion: 1, keyVersion, nonce, sealedPayload: ciphertext },
    { purpose, recordId, contextVersion: 1 },
    keys,
  );
  return encryptEnvelope(
    plaintext,
    { purpose, recordId, contextVersion: 1 },
    keys,
  );
}
function batchResult(stage: ReencryptionStage, rows: { id: string }[]) {
  return {
    checkpoint: { stage, afterId: rows.at(-1)?.id },
    processed: rows.length,
    complete: false as const,
  };
}
function nextStage(stage: ReencryptionStage): ReencryptionStage | undefined {
  return reencryptionStages[reencryptionStages.indexOf(stage) + 1];
}
function validateInput(
  input: {
    fromVersion: number;
    toVersion: number;
    batchSize: number;
    checkpoint?: ReencryptionCheckpoint;
  },
  keys: VersionedKeyRegistry,
) {
  if (
    !Number.isSafeInteger(input.fromVersion) ||
    input.fromVersion < 1 ||
    input.fromVersion === input.toVersion
  )
    throw new Error("Rotation requires distinct positive key versions.");
  if (input.toVersion !== keys.activeVersion)
    throw new Error("Rotation target must be the active write key version.");
  keys.readKey(input.fromVersion);
  if (
    !Number.isSafeInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > 500
  )
    throw new Error("Rotation batch size must be between 1 and 500.");
  if (input.checkpoint && !reencryptionStages.includes(input.checkpoint.stage))
    throw new Error("Invalid rotation checkpoint.");
}
