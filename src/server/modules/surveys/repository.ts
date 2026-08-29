import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "@/server/database/pool";
import { withSerializableRetry } from "@/server/database/transaction";
import { AppError } from "@/server/errors/app-error";
import type {
  SurveyDetail,
  SurveyDraftInput,
  SurveyStatus,
  SurveySummary,
} from "@/types/survey";

export interface SurveyRepository {
  list(): Promise<SurveySummary[]>;
  find(id: string): Promise<SurveyDetail | null>;
  create(
    ownerId: string,
    input: SurveyDraftInput,
    publicId: string,
  ): Promise<{ id: string }>;
  update(id: string, actorId: string, input: SurveyDraftInput): Promise<void>;
  duplicate(
    sourceId: string,
    ownerId: string,
    publicId: string,
  ): Promise<{ id: string }>;
  transition(input: {
    surveyId: string;
    actorId: string;
    from: SurveyStatus;
    target: SurveyStatus;
    stateVersion: number;
  }): Promise<void>;
  remove(id: string, actorId: string): Promise<{ tombstoned: boolean }>;
}

type SurveyRow = {
  id: string;
  public_id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  pause_reason: "MANUAL" | "INFRASTRUCTURE_CAPACITY" | null;
  state_version: number;
  question_count: number;
  created_at: Date;
  updated_at: Date;
  launched_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
};

export class PgSurveyRepository implements SurveyRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async list() {
    const result = await this.pool.query<SurveyRow>(
      `${baseSelect()} WHERE s.tombstoned_at IS NULL ORDER BY s.updated_at DESC`,
    );
    return result.rows.map(summary);
  }

  async find(id: string) {
    const result = await this.pool.query<SurveyRow>(
      `${baseSelect()} WHERE s.id = $1 AND s.tombstoned_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) return null;
    const questions = await this.pool.query<{
      id: string;
      position: number;
      type: SurveyDetail["questions"][number]["type"];
      prompt: string;
      required: boolean;
      option_position: number | null;
      option_label: string | null;
    }>(
      `SELECT q.id, q.position, q.type, q.prompt, q.required, o.position AS option_position, o.label AS option_label
         FROM questions q LEFT JOIN answer_options o ON o.question_id = q.id AND o.survey_id = q.survey_id
        WHERE q.survey_id = $1 ORDER BY q.position, o.position`,
      [id],
    );
    const grouped = new Map<string, SurveyDetail["questions"][number]>();
    for (const row of questions.rows) {
      let question = grouped.get(row.id);
      if (!question) {
        question = {
          id: row.id,
          position: row.position,
          type: row.type,
          prompt: row.prompt,
          required: row.required,
          options: [],
        };
        grouped.set(row.id, question);
      }
      if (row.option_label !== null) question.options.push(row.option_label);
    }
    return { ...summary(result.rows[0]), questions: [...grouped.values()] };
  }

  async create(ownerId: string, input: SurveyDraftInput, publicId: string) {
    const id = randomUUID();
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO surveys (id, public_id, owner_id, title, description, question_count, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
        [
          id,
          publicId,
          ownerId,
          input.title,
          input.description,
          input.questions.length,
        ],
      );
      await writeQuestions(client, id, input.questions);
      await audit(client, ownerId, id, "SURVEY_CREATED", {
        questionCount: input.questions.length,
      });
    });
    return { id };
  }

  async update(id: string, actorId: string, input: SurveyDraftInput) {
    await this.transaction(async (client) => {
      const locked = await client.query<{ status: SurveyStatus }>(
        "SELECT status FROM surveys WHERE id=$1 AND tombstoned_at IS NULL FOR UPDATE",
        [id],
      );
      if (!locked.rows[0]) throw missing();
      if (locked.rows[0].status !== "DRAFT")
        throw conflict("An activated questionnaire cannot be edited.");
      await client.query("DELETE FROM answer_options WHERE survey_id=$1", [id]);
      await client.query("DELETE FROM questions WHERE survey_id=$1", [id]);
      await client.query(
        "UPDATE surveys SET title=$2, description=$3, question_count=$4, updated_at=now() WHERE id=$1",
        [id, input.title, input.description, input.questions.length],
      );
      await writeQuestions(client, id, input.questions);
      await audit(client, actorId, id, "SURVEY_UPDATED", {
        questionCount: input.questions.length,
      });
    });
  }

  async duplicate(sourceId: string, ownerId: string, publicId: string) {
    const source = await this.find(sourceId);
    if (!source) throw missing();
    return this.create(
      ownerId,
      {
        title: `${source.title} (Copy)`.slice(0, 300),
        description: source.description,
        questions: source.questions.map(
          ({ prompt, type, required, options }) => ({
            prompt,
            type,
            required,
            options,
          }),
        ),
      },
      publicId,
    );
  }

  async transition(input: {
    surveyId: string;
    actorId: string;
    from: SurveyStatus;
    target: SurveyStatus;
    stateVersion: number;
  }) {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO infrastructure_control_state
          (singleton_key,protection_state,effective_percent,evaluated_at,updated_at)
         VALUES ('global','NORMAL',0,now(),now())
         ON CONFLICT (singleton_key) DO NOTHING`,
      );
      const control = await client.query<{ effective_percent: string }>(
        "SELECT effective_percent FROM infrastructure_control_state WHERE singleton_key='global' FOR UPDATE",
      );
      const locked = await client.query<{
        status: SurveyStatus;
        state_version: number;
        question_count: number;
      }>(
        "SELECT status,state_version,question_count FROM surveys WHERE id=$1 AND tombstoned_at IS NULL FOR UPDATE",
        [input.surveyId],
      );
      const row = locked.rows[0];
      if (!row) throw missing();
      if (row.status !== input.from || row.state_version !== input.stateVersion)
        throw conflict("The survey changed. Refresh and try again.");
      if (input.target === "ACTIVE") {
        if (Number(control.rows[0]?.effective_percent ?? 0) >= 95) {
          const active = await client.query<{ id: string }>(
            `SELECT id FROM surveys
              WHERE status='ACTIVE' AND tombstoned_at IS NULL
              ORDER BY id FOR UPDATE`,
          );
          if (active.rows.some((survey) => survey.id !== input.surveyId))
            throw conflict(
              "Capacity protection permits at most one active survey.",
            );
        }
        const invalid = await client.query<{ count: string }>(
          `SELECT count(*)::STRING AS count FROM questions q WHERE q.survey_id=$1 AND ((q.type='FREE_TEXT' AND EXISTS (SELECT 1 FROM answer_options o WHERE o.question_id=q.id)) OR (q.type IN ('SINGLE_CHOICE','MULTIPLE_CHOICE') AND (SELECT count(*) FROM answer_options o WHERE o.question_id=q.id) NOT BETWEEN 2 AND 11))`,
          [input.surveyId],
        );
        if (
          row.question_count < 1 ||
          row.question_count > 50 ||
          Number(invalid.rows[0]?.count) > 0
        )
          throw conflict("The questionnaire is not valid for activation.");
      }
      const reason = input.target === "PENDING_CAPACITY" ? "MANUAL" : null;
      const completed = input.target === "COMPLETED" ? "now()" : "NULL";
      await client.query(
        `UPDATE surveys SET status=$2, pause_reason=$3, state_version=state_version+1, launched_at=CASE WHEN $2='ACTIVE' AND launched_at IS NULL THEN now() ELSE launched_at END, paused_at=CASE WHEN $2='PENDING_CAPACITY' THEN now() ELSE paused_at END, completed_at=${completed}, state_changed_at=now(), updated_at=now() WHERE id=$1`,
        [input.surveyId, input.target, reason],
      );
      await audit(
        client,
        input.actorId,
        input.surveyId,
        `SURVEY_${input.target}`,
        {
          from: input.from,
          to: input.target,
          priorStateVersion: input.stateVersion,
        },
      );
    });
  }

  async remove(id: string, actorId: string) {
    return this.transaction(async (client) => {
      const row = await client.query<{
        status: SurveyStatus;
        has_data: boolean;
      }>(
        `SELECT s.status, (EXISTS(SELECT 1 FROM public_survey_sessions p WHERE p.survey_id=s.id) OR EXISTS(SELECT 1 FROM respondents r WHERE r.survey_id=s.id) OR EXISTS(SELECT 1 FROM response_attempts a WHERE a.survey_id=s.id) OR EXISTS(SELECT 1 FROM results_snapshots x WHERE x.survey_id=s.id)) AS has_data FROM surveys s WHERE s.id=$1 AND s.tombstoned_at IS NULL FOR UPDATE`,
        [id],
      );
      if (!row.rows[0]) throw missing();
      if (row.rows[0].status === "DRAFT" && !row.rows[0].has_data) {
        await client.query("DELETE FROM answer_options WHERE survey_id=$1", [
          id,
        ]);
        await client.query("DELETE FROM questions WHERE survey_id=$1", [id]);
        await client.query("DELETE FROM audit_events WHERE survey_id=$1", [id]);
        await client.query("DELETE FROM surveys WHERE id=$1", [id]);
        return { tombstoned: false };
      }
      await client.query(
        "UPDATE surveys SET tombstoned_at=now(), tombstoned_by_id=$2, updated_at=now() WHERE id=$1",
        [id, actorId],
      );
      await audit(client, actorId, id, "SURVEY_TOMBSTONED", {});
      return { tombstoned: true };
    });
  }

  private transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    return withSerializableRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const value = await operation(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
}

function baseSelect() {
  return `SELECT s.id,s.public_id,s.owner_id,u.display_name AS owner_name,s.title,s.description,s.status,s.pause_reason,s.state_version,s.question_count,s.created_at,s.updated_at,s.launched_at,s.paused_at,s.completed_at FROM surveys s JOIN users u ON u.id=s.owner_id`;
}
function summary(row: SurveyRow): SurveySummary {
  return {
    id: row.id,
    publicId: row.public_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    title: row.title,
    description: row.description,
    status: row.status,
    pauseReason: row.pause_reason,
    stateVersion: row.state_version,
    questionCount: row.question_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    launchedAt: row.launched_at,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
  };
}
async function writeQuestions(
  client: PoolClient,
  surveyId: string,
  questions: SurveyDraftInput["questions"],
) {
  for (const [index, question] of questions.entries()) {
    const questionId = randomUUID();
    await client.query(
      `INSERT INTO questions (id,survey_id,position,type,prompt,required,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
      [
        questionId,
        surveyId,
        index + 1,
        question.type,
        question.prompt,
        question.required,
      ],
    );
    for (const [optionIndex, label] of question.options.entries())
      await client.query(
        `INSERT INTO answer_options (id,question_id,survey_id,position,label,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,now(),now())`,
        [randomUUID(), questionId, surveyId, optionIndex + 1, label],
      );
  }
}
async function audit(
  client: PoolClient,
  actorId: string | null,
  surveyId: string,
  action: string,
  metadata: object,
) {
  await client.query(
    `INSERT INTO audit_events (id,actor_user_id,survey_id,action,target_type,target_id,result,safe_metadata,created_at) VALUES ($1,$2,$3,$4,'Survey',$5,'SUCCESS',$6,now())`,
    [
      randomUUID(),
      actorId,
      surveyId,
      action,
      surveyId,
      JSON.stringify(metadata),
    ],
  );
}
function conflict(message: string) {
  return new AppError({
    category: "CONFLICT",
    code: "SURVEY_CONFLICT",
    message,
    safeMessage: message,
    status: 409,
  });
}
function missing() {
  return new AppError({
    category: "NOT_FOUND",
    code: "SURVEY_NOT_FOUND",
    message: "Survey not found.",
    safeMessage: "Survey not found.",
    status: 404,
  });
}
