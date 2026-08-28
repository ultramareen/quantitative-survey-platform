import "server-only";

import type { Pool, PoolClient } from "pg";
import { withSerializableRetry } from "@/server/database/transaction";
import { AppError } from "@/server/errors/app-error";
import {
  decryptEnvelope,
  encryptEnvelope,
  hashSecureToken,
} from "@/server/modules/cryptography";
import type { CryptographyConfiguration } from "@/server/modules/cryptography/key-registry";
import type {
  PublicAnswerMutation,
  PublicAnswerValue,
  PublicAttemptState,
  PublicQuestion,
} from "@/types/public-survey";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
type Payload = { answers: Record<string, Exclude<PublicAnswerValue, null>> };
type AttemptRow = {
  id: string;
  survey_id: string;
  title: string;
  description: string | null;
  status: "CURRENT" | "ARCHIVED";
  survey_status: "ACTIVE" | "PENDING_CAPACITY" | "COMPLETED";
  generation: number;
  revision: number;
  last_mutation_id: string | null;
  payload_ciphertext: Buffer;
  payload_nonce: Buffer;
  payload_key_version: number;
  created_at: Date;
  last_answer_changed_at: Date | null;
};

export class PublicAttemptService {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptographyConfiguration,
    private readonly clock = () => new Date(),
  ) {}

  async load(
    publicId: string,
    token: string | undefined,
  ): Promise<PublicAttemptState> {
    const row = await this.resolve(this.pool, publicId, token, false);
    const questions = await this.questions(this.pool, row.survey_id);
    return this.state(row, questions);
  }

  async mutate(
    publicId: string,
    token: string | undefined,
    mutation: PublicAnswerMutation,
  ): Promise<PublicAttemptState> {
    return withSerializableRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const row = await this.resolve(client, publicId, token, true);
        const questions = await this.questions(client, row.survey_id);
        if (
          row.status !== "CURRENT" ||
          (row.survey_status !== "ACTIVE" &&
            row.survey_status !== "PENDING_CAPACITY")
        )
          throw conflict("This response can no longer be edited.");
        const deadline =
          (row.last_answer_changed_at ?? row.created_at).getTime() +
          24 * 60 * 60 * 1000;
        if (this.clock().getTime() >= deadline)
          throw conflict("Your response has already been recorded.");
        if (row.generation !== mutation.generation)
          throw conflict("This response has been replaced.");
        if (row.last_mutation_id === mutation.mutationId) {
          await client.query("COMMIT");
          return this.state(row, questions);
        }
        if (row.revision !== mutation.baseRevision) {
          await client.query("COMMIT");
          return { ...this.state(row, questions), conflict: true };
        }
        const question = questions.find(
          (item) => item.position === mutation.questionPosition,
        );
        if (!question) throw invalid();
        const value = validateValue(question, mutation.value);
        const payload = this.payload(row);
        const key = String(question.position);
        const previous = payload.answers[key];
        if (value === null) delete payload.answers[key];
        else payload.answers[key] = value;
        const changed =
          JSON.stringify(previous ?? null) !== JSON.stringify(value);
        if (!changed) {
          await client.query("COMMIT");
          return this.state(row, questions);
        }
        const envelope = encryptEnvelope(
          JSON.stringify(payload),
          { purpose: "ANSWER_PAYLOAD", recordId: row.id, contextVersion: 1 },
          this.crypto.piiEncryptionKeys,
        );
        const now = this.clock();
        const updated = await client.query<AttemptRow>(
          `UPDATE response_attempts SET payload_ciphertext=$2,payload_nonce=$3,payload_key_version=$4,
             revision=revision+1,save_count=save_count+1,last_mutation_id=$5,
             answered_question_count=$6,started_at=COALESCE(started_at,$7),last_activity_at=$7,last_answer_changed_at=$7
           WHERE id=$1 AND revision=$8 RETURNING *, (SELECT title FROM surveys WHERE id=survey_id) title,
             (SELECT description FROM surveys WHERE id=survey_id) description,
             (SELECT status FROM surveys WHERE id=survey_id) survey_status`,
          [
            row.id,
            envelope.sealedPayload,
            envelope.nonce,
            envelope.keyVersion,
            mutation.mutationId,
            Object.keys(payload.answers).length,
            now,
            row.revision,
          ],
        );
        if (!updated.rows[0])
          throw conflict("A newer answer was saved. Please retry.");
        await client.query("COMMIT");
        return this.state(updated.rows[0], questions);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }

  private async resolve(
    client: Pool | PoolClient,
    publicId: string,
    token: string | undefined,
    lock: boolean,
  ) {
    if (!token || !TOKEN_PATTERN.test(token)) throw unavailable();
    const result = await client.query<AttemptRow>(
      `SELECT a.*,s.title,s.description,s.status survey_status FROM response_attempts a JOIN surveys s ON s.id=a.survey_id
       WHERE s.public_id=$1 AND s.tombstoned_at IS NULL AND a.attempt_token_hash=$2 ${lock ? "FOR UPDATE" : ""}`,
      [publicId, hashSecureToken(token)],
    );
    if (!result.rows[0]) throw unavailable();
    return result.rows[0];
  }
  private async questions(
    client: Pool | PoolClient,
    surveyId: string,
  ): Promise<PublicQuestion[]> {
    const rows = await client.query<{
      position: number;
      type: PublicQuestion["type"];
      prompt: string;
      required: boolean;
      option_position: number | null;
      option_label: string | null;
    }>(
      `SELECT q.position,q.type,q.prompt,q.required,o.position option_position,o.label option_label FROM questions q
       LEFT JOIN answer_options o ON o.question_id=q.id WHERE q.survey_id=$1 ORDER BY q.position,o.position`,
      [surveyId],
    );
    const map = new Map<number, PublicQuestion>();
    for (const row of rows.rows) {
      let q = map.get(row.position);
      if (!q) {
        q = {
          position: row.position,
          type: row.type,
          prompt: row.prompt,
          required: row.required,
          options: [],
        };
        map.set(row.position, q);
      }
      if (row.option_position !== null)
        q.options.push({
          position: row.option_position,
          label: row.option_label!,
        });
    }
    return [...map.values()];
  }
  private payload(row: AttemptRow): Payload {
    return JSON.parse(
      decryptEnvelope(
        {
          envelopeVersion: 1,
          keyVersion: row.payload_key_version,
          nonce: row.payload_nonce,
          sealedPayload: row.payload_ciphertext,
        },
        { purpose: "ANSWER_PAYLOAD", recordId: row.id, contextVersion: 1 },
        this.crypto.piiEncryptionKeys,
      ).toString("utf8"),
    ) as Payload;
  }
  private state(
    row: AttemptRow,
    questions: PublicQuestion[],
  ): PublicAttemptState {
    return {
      title: row.title,
      description: row.description,
      generation: row.generation,
      revision: row.revision,
      answers: this.payload(row).answers,
      questions,
    };
  }
}

function validateValue(
  question: PublicQuestion,
  input: PublicAnswerValue,
): PublicAnswerValue {
  if (
    input === null ||
    input === "" ||
    (Array.isArray(input) && input.length === 0)
  )
    return null;
  const allowed = new Set(question.options.map((option) => option.position));
  if (
    question.type === "SINGLE_CHOICE" &&
    Number.isInteger(input) &&
    allowed.has(input as number)
  )
    return input;
  if (
    question.type === "MULTIPLE_CHOICE" &&
    Array.isArray(input) &&
    input.length <= 11 &&
    input.every((v) => Number.isInteger(v) && allowed.has(v)) &&
    new Set(input).size === input.length
  )
    return [...input].sort((a, b) => a - b);
  if (question.type === "FREE_TEXT" && typeof input === "string") {
    const text = input.trim();
    if (text.length <= 10000) return text || null;
  }
  throw invalid();
}
function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_ANSWER",
    message: "Invalid answer",
    safeMessage: "This answer is invalid.",
    status: 400,
  });
}
function unavailable() {
  return new AppError({
    category: "NOT_FOUND",
    code: "ATTEMPT_UNAVAILABLE",
    message: "Attempt unavailable",
    safeMessage: "This response is unavailable.",
    status: 404,
  });
}
function conflict(message: string) {
  return new AppError({
    category: "CONFLICT",
    code: "ATTEMPT_CONFLICT",
    message,
    safeMessage: message,
    status: 409,
  });
}
