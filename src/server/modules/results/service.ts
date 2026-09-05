import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabasePool } from "@/server/database/pool";
import { withSerializableRetry } from "@/server/database/transaction";
import { AppError } from "@/server/errors/app-error";
import {
  decryptEnvelope,
  encryptEnvelope,
} from "@/server/modules/cryptography";
import type { CryptographyConfiguration } from "@/server/modules/cryptography/key-registry";
import type { EmployeePrincipal } from "@/types/employee";
import type {
  FunnelResult,
  QuestionResult,
  ResultsSnapshotDto,
} from "@/types/results";

type Answer = number | number[] | string;
type Payload = { answers: Record<string, Answer> };
type Question = {
  id: string;
  position: number;
  prompt: string;
  type: QuestionResult["type"];
  options: { position: number; label: string }[];
};
type Attempt = {
  id: string;
  payload_ciphertext: Buffer;
  payload_nonce: Buffer;
  payload_key_version: number;
  answered_question_count: number;
  coverage_basis_count: number;
};

export class ResultsService {
  constructor(
    private readonly pool: Pool = getDatabasePool(),
    private readonly crypto: CryptographyConfiguration,
  ) {}
  async calculate(
    actor: EmployeePrincipal | null,
    surveyId: string,
  ): Promise<ResultsSnapshotDto> {
    const survey = await this.authorize(actor, surveyId);
    const cutoff = (
      await this.pool.query<{ cutoff: string; at: Date }>(
        "SELECT cluster_logical_timestamp()::STRING cutoff,statement_timestamp() at",
      )
    ).rows[0]!;
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(cutoff.cutoff)) throw internal();
    const historical = ` AS OF SYSTEM TIME '${cutoff.cutoff}' `;
    const [opens, identified, attemptRows, questionRows] = await Promise.all([
      this.pool.query<{ count: number }>(
        `SELECT count(*)::INT4 count FROM public_survey_sessions ${historical} WHERE survey_id=$1`,
        [surveyId],
      ),
      this.pool.query<{ count: number }>(
        `SELECT count(*)::INT4 count FROM respondents ${historical} WHERE survey_id=$1 AND identified_at <= $2`,
        [surveyId, cutoff.at],
      ),
      this.pool.query<Attempt>(
        `SELECT id,payload_ciphertext,payload_nonce,payload_key_version,answered_question_count,coverage_basis_count FROM response_attempts ${historical} WHERE survey_id=$1 AND status='CURRENT'`,
        [surveyId],
      ),
      this.pool.query<{
        id: string;
        position: number;
        prompt: string;
        type: QuestionResult["type"];
        option_position: number | null;
        option_label: string | null;
      }>(
        `SELECT questions.id,questions.position,questions.prompt,questions.type,answer_options.position option_position,answer_options.label option_label FROM questions LEFT JOIN answer_options ON answer_options.question_id=questions.id ${historical} WHERE questions.survey_id=$1 ORDER BY questions.position,answer_options.position`,
        [surveyId],
      ),
    ]);
    const questions = questionRows.rows.reduce<Question[]>((all, row) => {
      let q = all.at(-1);
      if (!q || q.id !== row.id) {
        q = {
          id: row.id,
          position: row.position,
          prompt: row.prompt,
          type: row.type,
          options: [],
        };
        all.push(q);
      }
      if (row.option_position !== null)
        q.options.push({
          position: row.option_position,
          label: row.option_label!,
        });
      return all;
    }, []);
    const payloads = attemptRows.rows.map((attempt) => ({
      attempt,
      answers: this.decrypt(attempt).answers,
    }));
    const opened = opens.rows[0]?.count ?? 0;
    const started = attemptRows.rows.filter(
      (a) => a.answered_question_count >= 1,
    ).length;
    const greaterThanHalf = attemptRows.rows.filter(
      (a) => a.answered_question_count * 2 > a.coverage_basis_count,
    ).length;
    const completed = attemptRows.rows.filter(
      (a) => a.answered_question_count === a.coverage_basis_count,
    ).length;
    const funnel: FunnelResult = {
      opened,
      identified: identified.rows[0]?.count ?? 0,
      currentAttempts: attemptRows.rowCount ?? 0,
      started,
      startedPercentage: percent(started, opened),
      greaterThanHalf,
      greaterThanHalfPercentage: percent(greaterThanHalf, opened),
      completed,
      completedPercentage: percent(completed, opened),
    };
    const freeText: {
      position: number;
      groups: {
        label: string;
        count: number;
        percentage: number;
        leader: boolean;
      }[];
    }[] = [];
    const results: QuestionResult[] = questions.map((q) => {
      const values = payloads
        .map((p) => p.answers[String(q.position)])
        .filter(
          (v): v is Answer =>
            v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0),
        );
      const denominator = values.length;
      if (q.type !== "FREE_TEXT") {
        const counts = q.options.map(
          (o) =>
            values.filter((v) =>
              Array.isArray(v) ? v.includes(o.position) : v === o.position,
            ).length,
        );
        const highest = Math.max(0, ...counts);
        return {
          position: q.position,
          prompt: q.prompt,
          type: q.type,
          denominator,
          options: q.options.map((o, i) => ({
            position: o.position,
            label: o.label,
            count: counts[i]!,
            percentage: percent(counts[i]!, denominator),
            leader: highest > 0 && counts[i] === highest,
          })),
        };
      }
      const map = new Map<string, { label: string; count: number }>();
      for (const value of values) {
        const label = String(value).trim();
        const key = label.normalize("NFKC").toLocaleLowerCase();
        const existing = map.get(key);
        if (existing) existing.count++;
        else map.set(key, { label, count: 1 });
      }
      const sorted = [...map.values()].sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label),
      );
      const highest = sorted[0]?.count ?? 0;
      const groups = sorted.slice(0, 10).map((g) => ({
        ...g,
        percentage: percent(g.count, denominator),
        leader: highest > 0 && g.count === highest,
      }));
      freeText.push({ position: q.position, groups });
      return {
        position: q.position,
        prompt: q.prompt,
        type: q.type,
        denominator,
        uniqueGroupCount: sorted.length,
        truncated: sorted.length > 10,
      };
    });
    const id = randomUUID();
    const envelope = freeText.length
      ? encryptEnvelope(
          JSON.stringify(freeText),
          {
            purpose: "RESULT_FREE_TEXT_LABELS",
            recordId: id,
            contextVersion: 1,
          },
          this.crypto.piiEncryptionKeys,
        )
      : undefined;
    const aggregate = { funnel, questions: results };
    const created = await this.insert(
      actor!,
      survey,
      id,
      cutoff,
      aggregate,
      envelope,
    );
    return this.dto(created, freeText);
  }

  async history(
    actor: EmployeePrincipal | null,
    surveyId: string,
  ): Promise<ResultsSnapshotDto[]> {
    if (!actor) throw denied();
    const survey = await this.pool.query<{ status: string }>(
      "SELECT status FROM surveys WHERE id=$1 AND tombstoned_at IS NULL",
      [surveyId],
    );
    if (
      !survey.rows[0] ||
      !["ACTIVE", "PENDING_CAPACITY", "COMPLETED"].includes(
        survey.rows[0].status,
      )
    )
      throw unavailable();
    const rows = await this.pool.query<any>(
      "SELECT * FROM results_snapshots WHERE survey_id=$1 ORDER BY snapshot_number DESC",
      [surveyId],
    );
    return rows.rows.map((row) => this.dto(row, this.decryptFreeText(row)));
  }
  async report(
    actor: EmployeePrincipal | null,
    surveyId: string,
    snapshotNumber: number,
  ) {
    if (!actor) throw denied();
    if (!Number.isInteger(snapshotNumber) || snapshotNumber < 1)
      throw unavailable();
    const result = await this.pool.query<any>(
      `SELECT rs.*,s.title survey_title,s.launched_at
       FROM results_snapshots rs JOIN surveys s ON s.id=rs.survey_id
       WHERE rs.survey_id=$1 AND rs.snapshot_number=$2 AND s.tombstoned_at IS NULL
         AND s.status IN ('ACTIVE','PENDING_CAPACITY','COMPLETED')`,
      [surveyId, snapshotNumber],
    );
    const row = result.rows[0];
    if (!row) throw unavailable();
    return {
      surveyTitle: row.survey_title as string,
      launchedAt: row.launched_at
        ? new Date(row.launched_at).toISOString()
        : null,
      snapshot: this.dto(row, this.decryptFreeText(row)),
    };
  }
  private async authorize(actor: EmployeePrincipal | null, surveyId: string) {
    if (!actor) throw denied();
    const result = await this.pool.query<{
      id: string;
      owner_id: string;
      status: string;
    }>(
      "SELECT id,owner_id,status FROM surveys WHERE id=$1 AND tombstoned_at IS NULL",
      [surveyId],
    );
    const row = result.rows[0];
    if (!row) throw unavailable();
    if (actor.role !== "ADMIN" && actor.id !== row.owner_id) throw denied();
    if (!["ACTIVE", "PENDING_CAPACITY", "COMPLETED"].includes(row.status))
      throw unavailable();
    return row;
  }
  private decrypt(a: Attempt): Payload {
    return JSON.parse(
      decryptEnvelope(
        {
          envelopeVersion: 1,
          keyVersion: a.payload_key_version,
          nonce: a.payload_nonce,
          sealedPayload: a.payload_ciphertext,
        },
        { purpose: "ANSWER_PAYLOAD", recordId: a.id, contextVersion: 1 },
        this.crypto.piiEncryptionKeys,
      ).toString("utf8"),
    );
  }
  private decryptFreeText(row: any) {
    if (!row.free_text_ciphertext) return [];
    return JSON.parse(
      decryptEnvelope(
        {
          envelopeVersion: 1,
          keyVersion: row.free_text_key_version,
          nonce: row.free_text_nonce,
          sealedPayload: row.free_text_ciphertext,
        },
        {
          purpose: "RESULT_FREE_TEXT_LABELS",
          recordId: row.id,
          contextVersion: 1,
        },
        this.crypto.piiEncryptionKeys,
      ).toString("utf8"),
    );
  }
  private insert(
    actor: EmployeePrincipal,
    survey: any,
    id: string,
    cutoff: any,
    aggregate: any,
    envelope: any,
  ) {
    return withSerializableRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const locked = await client.query<{ status: string }>(
          "SELECT status FROM surveys WHERE id=$1 AND tombstoned_at IS NULL FOR UPDATE",
          [survey.id],
        );
        if (
          !locked.rows[0] ||
          !["ACTIVE", "PENDING_CAPACITY", "COMPLETED"].includes(
            locked.rows[0].status,
          )
        )
          throw unavailable();
        const number = (
          await client.query<{ next: number }>(
            "SELECT COALESCE(max(snapshot_number),0)::INT4+1 next FROM results_snapshots WHERE survey_id=$1",
            [survey.id],
          )
        ).rows[0]!.next;
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(aggregate))
          .digest();
        const inserted = await client.query<any>(
          `INSERT INTO results_snapshots (id,survey_id,created_by_id,snapshot_number,data_cutoff_system_time,data_cutoff_at,opened_count,identified_count,started_count,greater_than_half_count,completed_count,aggregate_results,free_text_ciphertext,free_text_nonce,free_text_key_version,schema_version,source_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16) RETURNING *`,
          [
            id,
            survey.id,
            actor.id,
            number,
            cutoff.cutoff,
            cutoff.at,
            aggregate.funnel.opened,
            aggregate.funnel.identified,
            aggregate.funnel.started,
            aggregate.funnel.greaterThanHalf,
            aggregate.funnel.completed,
            JSON.stringify(aggregate),
            envelope?.sealedPayload ?? null,
            envelope?.nonce ?? null,
            envelope?.keyVersion ?? null,
            fingerprint,
          ],
        );
        await client.query(
          `INSERT INTO audit_events (id,actor_user_id,survey_id,action,target_type,target_id,result,safe_metadata,created_at) VALUES ($1,$2,$3,'RESULTS_CALCULATED','ResultsSnapshot',$4,'SUCCESS',$5,now())`,
          [
            randomUUID(),
            actor.id,
            survey.id,
            id,
            JSON.stringify({ snapshotNumber: number }),
          ],
        );
        await client.query("COMMIT");
        return inserted.rows[0];
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });
  }
  private dto(row: any, freeText: any[]): ResultsSnapshotDto {
    const aggregate =
      typeof row.aggregate_results === "string"
        ? JSON.parse(row.aggregate_results)
        : row.aggregate_results;
    const byPosition = new Map(
      freeText.map((item) => [item.position, item.groups]),
    );
    return {
      snapshotNumber: row.snapshot_number,
      dataCutoffAt: new Date(row.data_cutoff_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      funnel: {
        ...aggregate.funnel,
        currentAttempts: aggregate.funnel.currentAttempts ?? 0,
      },
      questions: aggregate.questions.map((q: QuestionResult) =>
        q.type === "FREE_TEXT"
          ? { ...q, freeTextGroups: byPosition.get(q.position) ?? [] }
          : q,
      ),
    };
  }
}
function percent(count: number, total: number) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}
function denied() {
  return new AppError({
    category: "AUTHORIZATION",
    code: "RESULTS_DENIED",
    message: "Denied",
    safeMessage: "You are not allowed to calculate these results.",
    status: 403,
  });
}
function unavailable() {
  return new AppError({
    category: "NOT_FOUND",
    code: "RESULTS_UNAVAILABLE",
    message: "Unavailable",
    safeMessage: "Results are unavailable.",
    status: 404,
  });
}
function internal() {
  return new AppError({
    category: "INTERNAL",
    code: "RESULTS_CUTOFF",
    message: "Invalid cutoff",
    safeMessage: "Results could not be calculated.",
    status: 500,
  });
}
