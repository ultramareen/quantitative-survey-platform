import "server-only";

import { AppError } from "@/server/errors/app-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertTrustedMutationOrigin(
  request: Request,
  applicationOrigin: string,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const requestOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const isSameOrigin = requestOrigin === new URL(applicationOrigin).origin;
  const hasTrustedFetchMetadata =
    fetchSite === null || fetchSite === "same-origin";

  if (!isSameOrigin || !hasTrustedFetchMetadata) {
    throw new AppError({
      category: "AUTHORIZATION",
      code: "UNTRUSTED_ORIGIN",
      message: "Mutation request failed origin verification.",
      safeMessage: "The request origin could not be verified.",
      status: 403,
    });
  }
}
