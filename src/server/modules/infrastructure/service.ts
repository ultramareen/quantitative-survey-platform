import "server-only";

import { AppError } from "@/server/errors/app-error";
import {
  requireAuthenticated,
  requireRole,
} from "@/server/modules/auth/policies";
import type { EmployeePrincipal } from "@/types/employee";
import { ALERT_THRESHOLDS } from "./constants";
import type {
  AlertLatch,
  InfrastructureRepository,
  UsageReading,
} from "./types";

export interface InfrastructureAlertMailAdapter {
  sendAlert(input: {
    recipients: string[];
    crossings: AlertLatch[];
    readings: UsageReading[];
  }): Promise<void>;
}

export class InfrastructureService {
  constructor(
    private readonly repository: InfrastructureRepository,
    private readonly mail: InfrastructureAlertMailAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly countAlertAsResend = false,
  ) {}

  headline(actor: EmployeePrincipal | null) {
    requireAuthenticated(actor);
    return this.repository.readHeadline();
  }

  adminView(actor: EmployeePrincipal | null) {
    requireRole(actor, ["ADMIN"]);
    return this.repository.readAdminView();
  }

  async reconcile(
    actor: EmployeePrincipal | null,
    input: {
      provider: string;
      quota: string;
      period: string;
      used: number;
      limit: number;
      collectedAt: Date;
    },
  ) {
    const admin = requireRole(actor, ["ADMIN"]);
    if (
      !isApprovedQuota(input.provider, input.quota) ||
      !input.period.trim() ||
      !Number.isFinite(input.used) ||
      input.used < 0 ||
      !Number.isFinite(input.limit) ||
      input.limit <= 0 ||
      !Number.isFinite(input.collectedAt.getTime()) ||
      input.collectedAt > this.now()
    )
      throw invalid();
    await this.repository.reconcile({ ...input, actorId: admin.id });
    await this.runCheck();
  }

  pauseAll(actor: EmployeePrincipal | null) {
    const admin = requireRole(actor, ["ADMIN"]);
    return this.repository.pauseAll(admin.id);
  }

  switchActive(actor: EmployeePrincipal | null, selectedPublicId: string) {
    const admin = requireRole(actor, ["ADMIN"]);
    if (!selectedPublicId || selectedPublicId.length > 255) throw invalid();
    return this.repository.switchActive(admin.id, selectedPublicId);
  }

  async runCheck() {
    const readings = await this.repository.evaluate(this.now());
    const primary = readings
      .filter((reading) => reading.drivesProtection)
      .reduce<UsageReading | undefined>(
        (highest, reading) =>
          !highest || reading.percent > highest.percent ? reading : highest,
        undefined,
      );
    const crossings = await this.repository.reserveThresholds(readings);
    if (crossings.length) {
      try {
        const recipients = await this.repository.activeAdminEmails();
        await this.mail.sendAlert({
          recipients,
          crossings,
          readings,
        });
        if (this.countAlertAsResend)
          for (let index = 0; index < recipients.length; index += 1)
            await this.repository.recordResendDelivery(this.now());
        await this.repository.markAlertsSent(crossings);
      } catch {
        await this.repository.markAlertsFailed(
          crossings,
          "Infrastructure alert delivery failed.",
        );
      }
    }
    if (primary && primary.percent >= 95)
      await this.repository.enforceCapacity(primary.percent);
    return { readings: readings.length, crossings: crossings.length };
  }

  recordResendDelivery(at = this.now()) {
    return this.repository.recordResendDelivery(at);
  }

  observeProductionDeployment(deploymentId: string, observedAt = this.now()) {
    if (!deploymentId || deploymentId.length > 255) return Promise.resolve();
    return this.repository.observeDeployment({
      deploymentId,
      production: true,
      observedAt,
    });
  }
}

function isApprovedQuota(provider: string, quota: string) {
  return (
    (provider === "NETLIFY" && quota === "CREDITS") ||
    (provider === "COCKROACH" &&
      (quota === "RU" || quota === "STORAGE_BYTES")) ||
    (provider === "RESEND" &&
      (quota === "DAILY_EMAILS" || quota === "MONTHLY_EMAILS"))
  );
}

export function crossedThresholds(percent: number) {
  return ALERT_THRESHOLDS.filter((threshold) => percent >= threshold);
}

function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_INFRASTRUCTURE_USAGE",
    message: "Infrastructure usage input is invalid.",
    safeMessage: "Infrastructure usage input is invalid.",
    status: 400,
  });
}
