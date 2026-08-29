export const ALERT_THRESHOLDS = [50, 75, 90, 95, 99] as const;
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
export const SCHEDULE_INTERVAL_HOURS = 3;

export const PROVIDER_CONSOLE_URLS = {
  NETLIFY: "https://app.netlify.com/teams",
  COCKROACH: "https://cockroachlabs.cloud/",
  RESEND: "https://resend.com/overview",
} as const;

export const QUOTA_LIMITS = {
  NETLIFY_CREDITS: 300,
  COCKROACH_RU: 50_000_000,
  COCKROACH_STORAGE_BYTES: 10 * 1024 ** 3,
  RESEND_DAILY: 100,
  RESEND_MONTHLY: 3_000,
} as const;
