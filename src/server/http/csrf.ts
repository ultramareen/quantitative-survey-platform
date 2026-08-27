import "server-only";

import { AppError } from "@/server/errors/app-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertTrustedMutationOrigin(
  request: Request,
  applicationOrigin: string,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const requestOrigin = request.headers.get("origin");
  const requestHost = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  const configuredUrl = new URL(applicationOrigin);
  const isSameOrigin = requestOrigin === configuredUrl.origin;
  const hasTrustedHost = requestHost === configuredUrl.host;
  const hasTrustedFetchMetadata =
    fetchSite === null || fetchSite === "same-origin";

  if (!isSameOrigin || !hasTrustedHost || !hasTrustedFetchMetadata) {
    throw new AppError({
      category: "AUTHORIZATION",
      code: "UNTRUSTED_ORIGIN",
      message: "Mutation request failed origin verification.",
      safeMessage: "The request origin could not be verified.",
      status: 403,
    });
  }
}
