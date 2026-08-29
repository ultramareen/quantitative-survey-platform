export type InfrastructureUsageSource =
  "APPLICATION_ESTIMATE" | "MANUAL_ACTUAL" | "PROVIDER_ACTUAL";

export type InfrastructureRiskTone =
  "green" | "yellow" | "orange" | "strong-orange" | "red" | "critical";

export type InfrastructureHeadline = {
  percent: number;
  provider: string | null;
  quota: string | null;
  source: InfrastructureUsageSource | null;
  updatedAt: string;
  stale: boolean;
  tone: InfrastructureRiskTone;
};

export type InfrastructureQuotaDetail = {
  provider: "NETLIFY" | "COCKROACH" | "RESEND";
  quota: string;
  used: number;
  limit: number;
  percent: number;
  source: InfrastructureUsageSource;
  period: string;
  resetsAt: string | null;
  updatedAt: string;
  stale: boolean;
  providerConsoleUrl: string;
  drivesProtection: boolean;
};

export type InfrastructureAdminView = {
  headline: InfrastructureHeadline;
  quotas: InfrastructureQuotaDetail[];
  activeSurveys: Array<{ publicId: string; title: string; ownerName: string }>;
  pendingSurveys: Array<{ publicId: string; title: string; ownerName: string }>;
};
