export const PUBLIC_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export function openCookieName(publicId: string) {
  return `qsp_public_open_${safeSuffix(publicId)}`;
}

export function attemptCookieName(publicId: string) {
  return `qsp_current_attempt_${safeSuffix(publicId)}`;
}

function safeSuffix(publicId: string) {
  return /^[A-Za-z0-9_-]{16,64}$/.test(publicId) ? publicId : "invalid";
}
