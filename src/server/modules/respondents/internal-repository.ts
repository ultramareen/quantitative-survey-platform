import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabasePool } from "@/server/database/pool";

export type InternalRespondentRow = {
  respondent_id: string;
  reference_id: string;
  name_ciphertext: Buffer;
  name_nonce: Buffer;
  name_key_version: number;
  phone_ciphertext: Buffer;
  phone_nonce: Buffer;
  phone_key_version: number;
  identified_at: Date;
  respondent_last_activity_at: Date;
  survey_id: string;
  survey_title: string;
  survey_status: "ACTIVE" | "PENDING_CAPACITY" | "COMPLETED";
  answered_question_count: number;
  coverage_basis_count: number;
  attempt_created_at: Date;
  started_at: Date | null;
  last_answer_changed_at: Date | null;
};

export type InternalRespondentQuery = {
  referenceId?: string;
  surveyId?: string;
  page: number;
  pageSize: number;
};

export interface InternalRespondentRepository {
  list(input: InternalRespondentQuery): Promise<{
    rows: InternalRespondentRow[];
    total: number;
  }>;
  detail(referenceId: string): Promise<InternalRespondentRow | null>;
  audit(input: {
    actorId: string;
    action:
      | "RESPONDENT_PII_LISTED"
      | "RESPONDENT_PII_SEARCHED"
      | "RESPONDENT_PII_VIEWED";
    targetId?: string;
    surveyId?: string;
    affectedRows: number;
    safeMetadata?: Record<string, unknown>;
  }): Promise<void>;
}

const SELECT = `SELECT r.id respondent_id,r.reference_id,r.name_ciphertext,r.name_nonce,r.name_key_version,
 r.phone_ciphertext,r.phone_nonce,r.phone_key_version,r.identified_at,
 r.last_activity_at respondent_last_activity_at,s.id survey_id,s.title survey_title,s.status survey_status,
 a.answered_question_count,a.coverage_basis_count,a.created_at attempt_created_at,
 a.started_at,a.last_answer_changed_at
 FROM respondents r JOIN surveys s ON s.id=r.survey_id
 JOIN response_attempts a ON a.respondent_id=r.id AND a.status='CURRENT'
 WHERE r.anonymized_at IS NULL AND s.tombstoned_at IS NULL`;

export class PgInternalRespondentRepository implements InternalRespondentRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async list(input: InternalRespondentQuery) {
    const values: unknown[] = [];
    const predicates: string[] = [];
    if (input.referenceId) {
      values.push(input.referenceId);
      predicates.push(`r.reference_id=$${values.length}`);
    }
    if (input.surveyId) {
      values.push(input.surveyId);
      predicates.push(`r.survey_id=$${values.length}`);
    }
    const filter = predicates.length ? ` AND ${predicates.join(" AND ")}` : "";
    const count = await this.pool.query<{ count: number }>(
      `SELECT count(*)::INT4 count FROM respondents r JOIN surveys s ON s.id=r.survey_id
       JOIN response_attempts a ON a.respondent_id=r.id AND a.status='CURRENT'
       WHERE r.anonymized_at IS NULL AND s.tombstoned_at IS NULL${filter}`,
      values,
    );
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const rows = await this.pool.query<InternalRespondentRow>(
      `${SELECT}${filter} ORDER BY r.identified_at DESC,r.reference_id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: count.rows[0]?.count ?? 0 };
  }

  async detail(referenceId: string) {
    const result = await this.pool.query<InternalRespondentRow>(
      `${SELECT} AND r.reference_id=$1 LIMIT 1`,
      [referenceId],
    );
    return result.rows[0] ?? null;
  }

  async audit(input: {
    actorId: string;
    action:
      | "RESPONDENT_PII_LISTED"
      | "RESPONDENT_PII_SEARCHED"
      | "RESPONDENT_PII_VIEWED";
    targetId?: string;
    surveyId?: string;
    affectedRows: number;
    safeMetadata?: Record<string, unknown>;
  }) {
    await this.pool.query(
      `INSERT INTO audit_events
       (id,actor_user_id,survey_id,action,target_type,target_id,result,affected_rows,safe_metadata,created_at)
       VALUES ($1,$2,$3,$4,'Respondent',$5,'SUCCESS',$6,$7,now())`,
      [
        randomUUID(),
        input.actorId,
        input.surveyId ?? null,
        input.action,
        input.targetId ?? null,
        input.affectedRows,
        JSON.stringify(input.safeMetadata ?? {}),
      ],
    );
  }
}
