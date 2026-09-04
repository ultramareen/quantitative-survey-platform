import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "@/server/database/pool";
import { withSerializableRetry } from "@/server/database/transaction";
import { AppError } from "@/server/errors/app-error";
import type {
  InfrastructureAdminView,
  InfrastructureHeadline,
  InfrastructureUsageSource,
} from "@/types/infrastructure";
import {
  ALERT_THRESHOLDS,
  PROVIDER_CONSOLE_URLS,
  QUOTA_LIMITS,
  STALE_AFTER_MS,
} from "./constants";
import { estimateNetlifyCredits, percent } from "./estimator";
import type {
  AlertLatch,
  InfrastructureRepository,
  UsageReading,
} from "./types";

type UsageRow = {
  provider: "NETLIFY" | "COCKROACH" | "BREVO";
  quota_key: string;
  period_key: string;
  used_units: string;
  limit_units: string;
  usage_percent: string;
  source: "ESTIMATED" | "MANUAL_ACTUAL" | "PROVIDER_ACTUAL";
  collected_at: Date;
};

export class PgInfrastructureRepository implements InfrastructureRepository {
  constructor(
    private readonly pool: Pool = getDatabasePool(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readHeadline(): Promise<InfrastructureHeadline> {
    const result = await this.pool.query<{
      effective_percent: string;
      effective_provider: string | null;
      effective_quota_key: string | null;
      effective_source: UsageRow["source"] | null;
      evaluated_at: Date;
    }>(
      "SELECT * FROM infrastructure_control_state WHERE singleton_key='global'",
    );
    const row = result.rows[0];
    const updatedAt = row?.evaluated_at ?? new Date(0);
    const value = Number(row?.effective_percent ?? 0);
    return {
      percent: round(value),
      provider: row?.effective_provider ?? null,
      quota: row?.effective_quota_key ?? null,
      source: source(row?.effective_source ?? null),
      updatedAt: updatedAt.toISOString(),
      stale: this.now().getTime() - updatedAt.getTime() > STALE_AFTER_MS,
      tone: tone(value),
    };
  }

  async readAdminView(): Promise<InfrastructureAdminView> {
    const [headline, readings, surveys] = await Promise.all([
      this.readHeadline(),
      this.latestReadings(),
      this.pool.query<{
        public_id: string;
        title: string;
        owner_name: string;
        status: "ACTIVE" | "PENDING_CAPACITY";
      }>(`SELECT s.public_id,s.title,u.display_name AS owner_name,s.status
            FROM surveys s JOIN users u ON u.id=s.owner_id
           WHERE s.tombstoned_at IS NULL AND s.status IN ('ACTIVE','PENDING_CAPACITY')
           ORDER BY s.title,s.public_id`),
    ]);
    const mapped = surveys.rows.map((row) => ({
      publicId: row.public_id,
      title: row.title,
      ownerName: row.owner_name,
    }));
    return {
      headline,
      quotas: readings,
      activeSurveys: surveys.rows
        .map((row, index) => ({ row, value: mapped[index] }))
        .filter(({ row }) => row.status === "ACTIVE")
        .map(({ value }) => value),
      pendingSurveys: surveys.rows
        .map((row, index) => ({ row, value: mapped[index] }))
        .filter(({ row }) => row.status === "PENDING_CAPACITY")
        .map(({ value }) => value),
    };
  }

  async evaluate(now: Date): Promise<UsageReading[]> {
    const month = periodMonth(now);
    const day = periodDay(now);
    await this.transaction(async (client) => {
      const buckets = await client.query<{
        provider: string;
        quota_key: string;
        request_count: string;
        execution_millis: string;
        response_bytes: string;
        estimated_units: string;
      }>(
        `SELECT provider,quota_key,sum(request_count)::STRING AS request_count,
                  sum(execution_millis)::STRING AS execution_millis,
                  sum(response_bytes)::STRING AS response_bytes,
                  sum(estimated_units)::STRING AS estimated_units
             FROM infrastructure_estimate_buckets
            WHERE period_key IN ($1,$2)
            GROUP BY provider,quota_key`,
        [month, day],
      );
      const netlify = buckets.rows.find(
        (row) => row.provider === "NETLIFY" && row.quota_key === "CREDITS",
      );
      const deploys = await client.query<{ count: string }>(
        `SELECT count(*)::STRING AS count FROM infrastructure_deployments
          WHERE provider='NETLIFY' AND production=true AND observed_at >= $1`,
        [startOfMonth(now)],
      );
      const credits = estimateNetlifyCredits({
        dynamicRequests: Number(netlify?.request_count ?? 0),
        sampledExecutionMillis: Number(netlify?.execution_millis ?? 0),
        sampledResponseBytes: Number(netlify?.response_bytes ?? 0),
        sampledRequestCount: Number(netlify?.request_count ?? 0),
        staticRequestMultiplier: 0.4,
        productionDeployments: Number(deploys.rows[0]?.count ?? 0),
      });
      const estimates = [
        [
          "NETLIFY",
          "CREDITS",
          month,
          credits.totalCredits,
          QUOTA_LIMITS.NETLIFY_CREDITS,
        ],
        [
          "COCKROACH",
          "RU",
          month,
          bucketUnits(buckets.rows, "COCKROACH", "RU"),
          QUOTA_LIMITS.COCKROACH_RU,
        ],
        [
          "COCKROACH",
          "STORAGE_BYTES",
          month,
          bucketUnits(buckets.rows, "COCKROACH", "STORAGE_BYTES"),
          QUOTA_LIMITS.COCKROACH_STORAGE_BYTES,
        ],
        [
          "BREVO",
          "DAILY_EMAILS",
          day,
          bucketUnits(buckets.rows, "BREVO", "DAILY_EMAILS"),
          QUOTA_LIMITS.BREVO_DAILY,
        ],
      ] as const;
      for (const [provider, quota, periodKey, used, limit] of estimates)
        await client.query(
          `INSERT INTO infrastructure_usage_snapshots
            (id,provider,quota_key,period_key,used_units,limit_units,usage_percent,source,safe_details,collected_at,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'ESTIMATED',$8,$9,now())`,
          [
            randomUUID(),
            provider,
            quota,
            periodKey,
            used,
            limit,
            percent(used, limit),
            JSON.stringify({ estimatorVersion: 1 }),
            now,
          ],
        );
      const effective = await latestEffectiveRows(client, month, day);
      const primary = effective
        .filter((row) => row.provider !== "BREVO")
        .sort((a, b) => Number(b.usage_percent) - Number(a.usage_percent))[0];
      const effectivePercent = Number(primary?.usage_percent ?? 0);
      await client.query(
        `UPSERT INTO infrastructure_control_state
          (singleton_key,protection_state,effective_percent,effective_provider,effective_quota_key,effective_source,evaluated_at,last_reconciled_at,updated_at)
         VALUES ('global',$1,$2,$3,$4,$5,$6,
           (SELECT max(collected_at) FROM infrastructure_usage_snapshots WHERE source='MANUAL_ACTUAL'),$6)`,
        [
          effectivePercent >= 99
            ? "CRITICAL"
            : effectivePercent >= 95
              ? "WARNING"
              : "NORMAL",
          effectivePercent,
          primary?.provider ?? null,
          primary?.quota_key ?? null,
          primary?.source ?? null,
          now,
        ],
      );
    });
    return this.latestReadings();
  }

  async reserveThresholds(readings: UsageReading[]): Promise<AlertLatch[]> {
    const reserved: AlertLatch[] = [];
    await this.transaction(async (client) => {
      for (const reading of readings) {
        for (const threshold of ALERT_THRESHOLDS) {
          if (reading.percent < threshold) continue;
          const result = await client.query(
            `INSERT INTO infrastructure_alert_deliveries
              (id,provider,quota_key,period_key,threshold,status,attempt_count,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,'PENDING',0,now(),now())
             ON CONFLICT (provider,quota_key,period_key,threshold) DO NOTHING
             RETURNING id`,
            [
              randomUUID(),
              reading.provider,
              reading.quota,
              reading.period,
              threshold,
            ],
          );
          if (result.rowCount)
            reserved.push({
              provider: reading.provider,
              quota: reading.quota,
              period: reading.period,
              threshold,
            });
        }
      }
      const failed = await client.query<{
        provider: string;
        quota_key: string;
        period_key: string;
        threshold: number;
      }>(`SELECT provider,quota_key,period_key,threshold
            FROM infrastructure_alert_deliveries
           WHERE status='FAILED' AND attempt_count < 3
             AND (last_attempt_at IS NULL OR last_attempt_at < now() - INTERVAL '15 minutes')
           FOR UPDATE`);
      for (const row of failed.rows) {
        const latch = {
          provider: row.provider,
          quota: row.quota_key,
          period: row.period_key,
          threshold: row.threshold,
        };
        if (!reserved.some((item) => sameLatch(item, latch)))
          reserved.push(latch);
        await client.query(
          `UPDATE infrastructure_alert_deliveries SET status='PENDING',updated_at=now()
            WHERE provider=$1 AND quota_key=$2 AND period_key=$3 AND threshold=$4`,
          [latch.provider, latch.quota, latch.period, latch.threshold],
        );
      }
    });
    return reserved;
  }

  async activeAdminEmails() {
    const result = await this.pool.query<{ email_normalized: string }>(
      "SELECT email_normalized FROM users WHERE role='ADMIN' AND disabled_at IS NULL ORDER BY email_normalized",
    );
    return result.rows.map((row) => row.email_normalized);
  }

  markAlertsSent(latches: AlertLatch[]) {
    return this.updateAlerts(latches, true);
  }

  markAlertsFailed(latches: AlertLatch[], safeError: string) {
    return this.updateAlerts(latches, false, safeError.slice(0, 1000));
  }

  async enforceCapacity(effectivePercent: number) {
    return this.transaction(async (client) => {
      await lockControl(client);
      const active = await client.query<{ id: string }>(
        `SELECT id FROM surveys WHERE status='ACTIVE' AND tombstoned_at IS NULL ORDER BY id FOR UPDATE`,
      );
      if (effectivePercent < 95 || active.rows.length < 2) return 0;
      const ids = active.rows.map((row) => row.id);
      await client.query(
        `UPDATE surveys SET status='PENDING_CAPACITY',pause_reason='INFRASTRUCTURE_CAPACITY',
          state_version=state_version+1,paused_at=now(),state_changed_at=now(),updated_at=now()
          WHERE id=ANY($1::UUID[])`,
        [ids],
      );
      await safeAudit(
        client,
        null,
        "INFRASTRUCTURE_AUTOMATIC_PAUSE",
        ids.length,
        {
          threshold: 95,
        },
      );
      return ids.length;
    });
  }

  async pauseAll(actorId: string) {
    return this.transaction(async (client) => {
      await lockControl(client);
      const result = await client.query(
        `UPDATE surveys SET status='PENDING_CAPACITY',pause_reason='MANUAL',
          state_version=state_version+1,paused_at=now(),state_changed_at=now(),updated_at=now()
          WHERE status='ACTIVE' AND tombstoned_at IS NULL RETURNING id`,
      );
      await safeAudit(
        client,
        actorId,
        "INFRASTRUCTURE_PAUSE_ALL",
        result.rowCount ?? 0,
        {},
      );
      return result.rowCount ?? 0;
    });
  }

  async switchActive(actorId: string, selectedPublicId: string) {
    await this.transaction(async (client) => {
      const control = await lockControl(client);
      if (Number(control.effective_percent) < 95)
        throw conflict("Atomic switching is available at or above 95% usage.");
      const surveys = await client.query<{
        id: string;
        public_id: string;
        status: string;
      }>(
        `SELECT id,public_id,status FROM surveys
          WHERE tombstoned_at IS NULL AND (status='ACTIVE' OR public_id=$1)
          ORDER BY id FOR UPDATE`,
        [selectedPublicId],
      );
      const selected = surveys.rows.find(
        (row) => row.public_id === selectedPublicId,
      );
      if (
        !selected ||
        !["ACTIVE", "PENDING_CAPACITY"].includes(selected.status)
      )
        throw conflict("The selected survey is not eligible for activation.");
      await client.query(
        `UPDATE surveys SET status='PENDING_CAPACITY',pause_reason='MANUAL',state_version=state_version+1,
          paused_at=now(),state_changed_at=now(),updated_at=now()
          WHERE status='ACTIVE' AND tombstoned_at IS NULL AND id<>$1`,
        [selected.id],
      );
      await client.query(
        `UPDATE surveys SET status='ACTIVE',pause_reason=NULL,state_version=state_version+1,
          launched_at=COALESCE(launched_at,now()),state_changed_at=now(),updated_at=now()
          WHERE id=$1 AND status='PENDING_CAPACITY'`,
        [selected.id],
      );
      await safeAudit(client, actorId, "INFRASTRUCTURE_ATOMIC_SWITCH", 1, {});
    });
  }

  async recordBrevoDelivery(at: Date) {
    await this.incrementBucket("BREVO", "DAILY_EMAILS", periodDay(at), at);
  }

  async observeDeployment(input: {
    deploymentId: string;
    production: boolean;
    observedAt: Date;
  }) {
    await this.pool.query(
      `INSERT INTO infrastructure_deployments
        (id,provider,provider_deployment_id,production,observed_at,created_at)
       VALUES ($1,'NETLIFY',$2,$3,$4,now())
       ON CONFLICT (provider,provider_deployment_id) DO NOTHING`,
      [randomUUID(), input.deploymentId, input.production, input.observedAt],
    );
  }

  private async latestReadings(): Promise<UsageReading[]> {
    const now = this.now();
    const rows = await latestEffectiveRows(
      this.pool,
      periodMonth(now),
      periodDay(now),
    );
    return rows.map((row) => ({
      provider: row.provider,
      quota: row.quota_key,
      used: Number(row.used_units),
      limit: Number(row.limit_units),
      percent: round(Number(row.usage_percent)),
      source: source(row.source)!,
      period: row.period_key,
      resetsAt: resetAt(row.period_key)?.toISOString() ?? null,
      updatedAt: row.collected_at.toISOString(),
      stale: now.getTime() - row.collected_at.getTime() > STALE_AFTER_MS,
      providerConsoleUrl: PROVIDER_CONSOLE_URLS[row.provider],
      drivesProtection: row.provider !== "BREVO",
      collectedAt: row.collected_at,
    }));
  }

  private async updateAlerts(
    latches: AlertLatch[],
    sent: boolean,
    safeError?: string,
  ) {
    if (!latches.length) return;
    await this.transaction(async (client) => {
      for (const latch of latches)
        await client.query(
          `UPDATE infrastructure_alert_deliveries SET status=$5,
             attempt_count=attempt_count+1,safe_last_error=$6,last_attempt_at=now(),
             sent_at=CASE WHEN $5='SENT' THEN now() ELSE NULL END,updated_at=now()
           WHERE provider=$1 AND quota_key=$2 AND period_key=$3 AND threshold=$4`,
          [
            latch.provider,
            latch.quota,
            latch.period,
            latch.threshold,
            sent ? "SENT" : "FAILED",
            safeError ?? null,
          ],
        );
    });
  }

  private async incrementBucket(
    provider: string,
    quota: string,
    period: string,
    at: Date,
  ) {
    const bucket = new Date(at);
    bucket.setUTCMinutes(0, 0, 0);
    await this.pool.query(
      `INSERT INTO infrastructure_estimate_buckets
        (id,provider,quota_key,period_key,bucket_started_at,request_count,execution_millis,response_bytes,estimated_units,estimator_version,updated_at)
       VALUES ($1,$2,$3,$4,$5,0,0,0,1,1,now())
       ON CONFLICT (provider,quota_key,period_key,bucket_started_at)
       DO UPDATE SET estimated_units=infrastructure_estimate_buckets.estimated_units+1,updated_at=now()`,
      [randomUUID(), provider, quota, period, bucket],
    );
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

async function latestEffectiveRows(
  client: Pick<Pool, "query"> | PoolClient,
  month: string,
  day: string,
) {
  const result = await client.query<UsageRow>(
    `SELECT provider,quota_key,period_key,used_units,limit_units,usage_percent,source,collected_at
       FROM (SELECT *,row_number() OVER (
         PARTITION BY provider,quota_key,period_key
         ORDER BY CASE source WHEN 'PROVIDER_ACTUAL' THEN 3 WHEN 'MANUAL_ACTUAL' THEN 2 ELSE 1 END DESC,
           collected_at DESC
       ) AS rank FROM infrastructure_usage_snapshots WHERE period_key IN ($1,$2)) ranked
      WHERE rank=1 ORDER BY provider,quota_key`,
    [month, day],
  );
  return result.rows;
}

async function lockControl(client: PoolClient) {
  await client.query(
    `INSERT INTO infrastructure_control_state
      (singleton_key,protection_state,effective_percent,evaluated_at,updated_at)
     VALUES ('global','NORMAL',0,now(),now()) ON CONFLICT (singleton_key) DO NOTHING`,
  );
  const result = await client.query<{ effective_percent: string }>(
    "SELECT effective_percent FROM infrastructure_control_state WHERE singleton_key='global' FOR UPDATE",
  );
  return result.rows[0]!;
}

async function safeAudit(
  client: PoolClient,
  actorId: string | null,
  action: string,
  affected: number,
  metadata: object,
) {
  await client.query(
    `INSERT INTO audit_events (id,actor_user_id,action,target_type,result,affected_rows,safe_metadata,created_at)
     VALUES ($1,$2,$3,'InfrastructureControl','SUCCESS',$4,$5,now())`,
    [randomUUID(), actorId, action, affected, JSON.stringify(metadata)],
  );
}

function bucketUnits(
  rows: Array<{ provider: string; quota_key: string; estimated_units: string }>,
  provider: string,
  quota: string,
) {
  return Number(
    rows.find((row) => row.provider === provider && row.quota_key === quota)
      ?.estimated_units ?? 0,
  );
}
function periodMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}
function periodDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function resetAt(period: string) {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-").map(Number);
    return new Date(Date.UTC(year!, month!, 1));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const date = new Date(`${period}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
  return null;
}
function source(
  value: UsageRow["source"] | null,
): InfrastructureUsageSource | null {
  return value === "ESTIMATED" ? "APPLICATION_ESTIMATE" : value;
}
function round(value: number) {
  return Math.round(value * 10) / 10;
}
function tone(value: number): InfrastructureHeadline["tone"] {
  if (value >= 99) return "critical";
  if (value >= 95) return "red";
  if (value >= 90) return "strong-orange";
  if (value >= 75) return "orange";
  if (value >= 50) return "yellow";
  return "green";
}
function sameLatch(a: AlertLatch, b: AlertLatch) {
  return (
    a.provider === b.provider &&
    a.quota === b.quota &&
    a.period === b.period &&
    a.threshold === b.threshold
  );
}
function conflict(message: string) {
  return new AppError({
    category: "CONFLICT",
    code: "INFRASTRUCTURE_CONFLICT",
    message,
    safeMessage: message,
    status: 409,
  });
}
