import type {
  InfrastructureAdminView,
  InfrastructureHeadline,
  InfrastructureQuotaDetail,
} from "@/types/infrastructure";

export type UsageReading = InfrastructureQuotaDetail & { collectedAt: Date };

export type CapacitySurvey = {
  id: string;
  publicId: string;
  title: string;
  ownerName: string;
};

export type AlertLatch = {
  provider: string;
  quota: string;
  period: string;
  threshold: number;
};

export interface InfrastructureRepository {
  readHeadline(): Promise<InfrastructureHeadline>;
  readAdminView(): Promise<InfrastructureAdminView>;
  reconcile(input: {
    provider: string;
    quota: string;
    period: string;
    used: number;
    limit: number;
    collectedAt: Date;
    actorId: string;
  }): Promise<void>;
  evaluate(now: Date): Promise<UsageReading[]>;
  reserveThresholds(readings: UsageReading[]): Promise<AlertLatch[]>;
  activeAdminEmails(): Promise<string[]>;
  markAlertsSent(latches: AlertLatch[]): Promise<void>;
  markAlertsFailed(latches: AlertLatch[], safeError: string): Promise<void>;
  enforceCapacity(percent: number): Promise<number>;
  pauseAll(actorId: string): Promise<number>;
  switchActive(actorId: string, selectedPublicId: string): Promise<void>;
  recordResendDelivery(at: Date): Promise<void>;
  observeDeployment(input: {
    deploymentId: string;
    production: boolean;
    observedAt: Date;
  }): Promise<void>;
}
