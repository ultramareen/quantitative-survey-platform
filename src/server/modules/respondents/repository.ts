import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "@/server/database/pool";
import { withSerializableRetry } from "@/server/database/transaction";
import { AppError } from "@/server/errors/app-error";
import type { PublicSurveyOpenResult } from "@/types/public-survey";

export type IdentityPersistenceInput = {
  publicId: string;
  openTokenHash: Buffer;
  attemptTokenHash: Buffer;
  respondentId: string;
  referenceId: string;
  nameCiphertext: Buffer;
  nameNonce: Buffer;
  nameKeyVersion: number;
  phoneCiphertext: Buffer;
  phoneNonce: Buffer;
  phoneKeyVersion: number;
  phoneLookupHash: Buffer;
  phoneLookupKeyVersion: number;
  attemptId: string;
  payloadCiphertext: Buffer;
  payloadNonce: Buffer;
  payloadKeyVersion: number;
  now: Date;
};

export interface RespondentRepository {
  open(input: {
    publicId: string;
    tokenHash?: Buffer;
    newTokenHash: Buffer;
    now: Date;
  }): Promise<
    PublicSurveyOpenResult & { surveyId?: string; createdOpen?: boolean }
  >;
  resolveIdentityContext(
    publicId: string,
    openTokenHash: Buffer,
  ): Promise<{ surveyId: string } | null>;
  identify(
    input: IdentityPersistenceInput,
  ): Promise<{ createdAttempt: boolean; referenceCollision?: boolean }>;
  consumeRateLimit(input: {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
    expiresAt: Date;
    limit: number;
  }): Promise<void>;
}

export class PgRespondentRepository implements RespondentRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async open(input: {
    publicId: string;
    tokenHash?: Buffer;
    newTokenHash: Buffer;
    now: Date;
  }) {
    return this.transaction(async (client) => {
      const survey = await client.query<{
        id: string;
        title: string;
        description: string | null;
        status: "DRAFT" | "ACTIVE" | "PENDING_CAPACITY" | "COMPLETED";
      }>(
        `SELECT id,title,description,status FROM surveys WHERE public_id=$1 AND tombstoned_at IS NULL LIMIT 1`,
        [input.publicId],
      );
      const row = survey.rows[0];
      if (
        !row ||
        (row.status !== "ACTIVE" && row.status !== "PENDING_CAPACITY")
      )
        return { availability: "UNAVAILABLE" as const, identified: false };
      if (input.tokenHash) {
        const existing = await client.query<{ respondent_id: string | null }>(
          `UPDATE public_survey_sessions SET last_seen_at=$3 WHERE open_token_hash=$1 AND survey_id=$2 AND invalidated_at IS NULL RETURNING respondent_id`,
          [input.tokenHash, row.id, input.now],
        );
        if (existing.rows[0])
          return {
            availability:
              row.status === "ACTIVE"
                ? ("ACTIVE" as const)
                : ("PENDING" as const),
            title: row.title,
            description: row.description,
            identified: existing.rows[0].respondent_id !== null,
            surveyId: row.id,
          };
      }
      await client.query(
        `INSERT INTO public_survey_sessions (id,survey_id,open_token_hash,created_while_status,first_opened_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$5)`,
        [randomUUID(), row.id, input.newTokenHash, row.status, input.now],
      );
      return {
        availability:
          row.status === "ACTIVE" ? ("ACTIVE" as const) : ("PENDING" as const),
        title: row.title,
        description: row.description,
        identified: false,
        surveyId: row.id,
        createdOpen: true,
      };
    });
  }

  async resolveIdentityContext(publicId: string, openTokenHash: Buffer) {
    const result = await this.pool.query<{ survey_id: string }>(
      `SELECT p.survey_id FROM public_survey_sessions p JOIN surveys s ON s.id=p.survey_id
        WHERE s.public_id=$1 AND p.open_token_hash=$2 AND p.invalidated_at IS NULL
          AND s.tombstoned_at IS NULL AND s.status='ACTIVE' LIMIT 1`,
      [publicId, openTokenHash],
    );
    return result.rows[0] ? { surveyId: result.rows[0].survey_id } : null;
  }

  async identify(input: IdentityPersistenceInput) {
    try {
      return await this.transaction(async (client) => {
        const resolved = await client.query<{
          session_id: string;
          survey_id: string;
          question_count: number;
          respondent_id: string | null;
        }>(
          `SELECT p.id AS session_id,p.survey_id,s.question_count,p.respondent_id
             FROM public_survey_sessions p JOIN surveys s ON s.id=p.survey_id
            WHERE p.open_token_hash=$1 AND s.public_id=$2 AND p.invalidated_at IS NULL
              AND s.tombstoned_at IS NULL AND s.status='ACTIVE' FOR UPDATE`,
          [input.openTokenHash, input.publicId],
        );
        const session = resolved.rows[0];
        if (!session) throw unavailable();
        if (session.respondent_id) return { createdAttempt: false };

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO respondents
           (id,survey_id,reference_id,name_ciphertext,name_nonce,name_key_version,phone_ciphertext,phone_nonce,phone_key_version,phone_lookup_hash,phone_lookup_key_version,identified_at,last_activity_at,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12,$12)
           ON CONFLICT (survey_id,phone_lookup_hash) WHERE phone_lookup_hash IS NOT NULL DO NOTHING RETURNING id`,
          [
            input.respondentId,
            session.survey_id,
            input.referenceId,
            input.nameCiphertext,
            input.nameNonce,
            input.nameKeyVersion,
            input.phoneCiphertext,
            input.phoneNonce,
            input.phoneKeyVersion,
            input.phoneLookupHash,
            input.phoneLookupKeyVersion,
            input.now,
          ],
        );
        const created = inserted.rows[0];
        let respondentId = created?.id;
        if (!respondentId) {
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM respondents WHERE survey_id=$1 AND phone_lookup_hash=$2 AND anonymized_at IS NULL FOR UPDATE`,
            [session.survey_id, input.phoneLookupHash],
          );
          respondentId = existing.rows[0]?.id;
          if (!respondentId) throw unavailable();
        }
        await client.query(
          `UPDATE public_survey_sessions SET respondent_id=$2,last_seen_at=$3 WHERE id=$1`,
          [session.session_id, respondentId, input.now],
        );
        if (!created) return { createdAttempt: false };
        await client.query(
          `INSERT INTO response_attempts
           (id,survey_id,respondent_id,public_survey_session_id,status,generation,attempt_number,attempt_token_hash,payload_ciphertext,payload_nonce,payload_key_version,payload_schema_version,revision,save_count,answered_question_count,coverage_basis_count,created_at,last_activity_at)
           VALUES ($1,$2,$3,$4,'CURRENT',1,1,$5,$6,$7,$8,1,0,0,0,$9,$10,$10)`,
          [
            input.attemptId,
            session.survey_id,
            respondentId,
            session.session_id,
            input.attemptTokenHash,
            input.payloadCiphertext,
            input.payloadNonce,
            input.payloadKeyVersion,
            session.question_count,
            input.now,
          ],
        );
        return { createdAttempt: true };
      });
    } catch (error) {
      const candidate = error as { code?: string; constraint?: string };
      if (
        candidate.code === "23505" &&
        candidate.constraint?.includes("reference")
      )
        return { createdAttempt: false, referenceCollision: true };
      throw error;
    }
  }

  async consumeRateLimit(input: {
    scope: string;
    subjectHash: Buffer;
    windowStart: Date;
    expiresAt: Date;
    limit: number;
  }) {
    const result = await this.pool.query<{ hit_count: number }>(
      `INSERT INTO security_rate_limits (id,scope,subject_hash,window_start,expires_at,hit_count,updated_at)
       VALUES ($1,$2,$3,$4,$5,1,now())
       ON CONFLICT (scope,subject_hash,window_start) DO UPDATE SET hit_count=security_rate_limits.hit_count+1,updated_at=now()
       RETURNING hit_count`,
      [
        randomUUID(),
        input.scope,
        input.subjectHash,
        input.windowStart,
        input.expiresAt,
      ],
    );
    if ((result.rows[0]?.hit_count ?? input.limit + 1) > input.limit)
      throw new AppError({
        category: "RATE_LIMIT",
        code: "RATE_LIMITED",
        message: "Public request rate exceeded.",
        safeMessage: "Too many requests. Please try again later.",
        status: 429,
      });
  }

  private transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    return withSerializableRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
}

function unavailable() {
  return new AppError({
    category: "CONFLICT",
    code: "PUBLIC_SURVEY_UNAVAILABLE",
    message: "Survey is unavailable for identification.",
    safeMessage: "This survey is not accepting new responses.",
    status: 409,
  });
}
