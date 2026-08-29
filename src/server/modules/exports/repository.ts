import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabasePool } from "@/server/database/pool";

export type ExportSurvey = { id: string; title: string; status: string };
export type ExportQuestion = {
  position: number;
  prompt: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FREE_TEXT";
  options: { position: number; label: string }[];
};
export type ExportAttemptRow = {
  attempt_id: string;
  respondent_id: string;
  reference_id: string;
  name_ciphertext: Buffer;
  name_nonce: Buffer;
  name_key_version: number;
  phone_ciphertext: Buffer;
  phone_nonce: Buffer;
  phone_key_version: number;
  payload_ciphertext: Buffer;
  payload_nonce: Buffer;
  payload_key_version: number;
  attempt_number: number;
  created_at: Date;
  started_at: Date | null;
  last_answer_changed_at: Date | null;
  archived_at: Date | null;
  archive_reason: string | null;
};

export class ExportRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async survey(id: string) {
    const result = await this.pool.query<ExportSurvey>(
      `SELECT id,title,status FROM surveys
       WHERE id=$1 AND tombstoned_at IS NULL
       AND status IN ('ACTIVE','PENDING_CAPACITY','COMPLETED')`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async questions(surveyId: string): Promise<ExportQuestion[]> {
    const result = await this.pool.query<{
      position: number;
      prompt: string;
      type: ExportQuestion["type"];
      option_position: number | null;
      option_label: string | null;
    }>(
      `SELECT q.position,q.prompt,q.type,o.position option_position,o.label option_label
       FROM questions q LEFT JOIN answer_options o ON o.question_id=q.id
       WHERE q.survey_id=$1 ORDER BY q.position,o.position`,
      [surveyId],
    );
    return result.rows.reduce<ExportQuestion[]>((all, row) => {
      let question = all.at(-1);
      if (!question || question.position !== row.position) {
        question = {
          position: row.position,
          prompt: row.prompt,
          type: row.type,
          options: [],
        };
        all.push(question);
      }
      if (row.option_position !== null)
        question.options.push({
          position: row.option_position,
          label: row.option_label!,
        });
      return all;
    }, []);
  }

  async attemptEstimate(surveyId: string, status: "CURRENT" | "ARCHIVED") {
    const result = await this.pool.query<{
      count: number;
      payload_bytes: number;
    }>(
      `SELECT count(*)::INT4 count,
       COALESCE(sum(octet_length(a.payload_ciphertext)),0)::INT8::INT4 payload_bytes
       FROM response_attempts a
       JOIN respondents r ON r.id=a.respondent_id
       WHERE a.survey_id=$1 AND a.status=$2 AND r.anonymized_at IS NULL`,
      [surveyId, status],
    );
    return result.rows[0] ?? { count: 0, payload_bytes: 0 };
  }

  async attempts(
    surveyId: string,
    status: "CURRENT" | "ARCHIVED",
    limit: number,
    offset: number,
  ) {
    const result = await this.pool.query<ExportAttemptRow>(
      `SELECT a.id attempt_id,r.id respondent_id,r.reference_id,r.name_ciphertext,r.name_nonce,r.name_key_version,
       r.phone_ciphertext,r.phone_nonce,r.phone_key_version,a.payload_ciphertext,a.payload_nonce,
       a.payload_key_version,a.attempt_number,a.created_at,a.started_at,a.last_answer_changed_at,
       a.archived_at,a.archive_reason
       FROM response_attempts a JOIN respondents r ON r.id=a.respondent_id
       WHERE a.survey_id=$1 AND a.status=$2 AND r.anonymized_at IS NULL
       ORDER BY r.reference_id,a.attempt_number LIMIT $3 OFFSET $4`,
      [surveyId, status, limit, offset],
    );
    return result.rows;
  }

  async snapshot(surveyId: string, snapshotNumber: number) {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM results_snapshots WHERE survey_id=$1 AND snapshot_number=$2`,
      [surveyId, snapshotNumber],
    );
    return result.rows[0] ?? null;
  }

  async audit(input: {
    actorId: string;
    surveyId: string;
    action: string;
    affectedRows: number;
    safeMetadata: Record<string, unknown>;
  }) {
    await this.pool.query(
      `INSERT INTO audit_events
       (id,actor_user_id,survey_id,action,target_type,target_id,result,affected_rows,safe_metadata,created_at)
       VALUES ($1,$2,$3,$4,'Survey',$3,'SUCCESS',$5,$6,now())`,
      [
        randomUUID(),
        input.actorId,
        input.surveyId,
        input.action,
        input.affectedRows,
        JSON.stringify(input.safeMetadata),
      ],
    );
  }
}
