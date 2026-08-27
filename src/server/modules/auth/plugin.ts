import "server-only";

import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

import { AppError } from "@/server/errors/app-error";
import { secureCookieOptions } from "@/server/http/cookies";
import { assertTrustedMutationOrigin } from "@/server/http/csrf";
import { AUTH_COOKIE_NAME, SESSION_ABSOLUTE_MILLISECONDS } from "./constants";
import { normalizeRateLimitIp } from "./rate-limit";
import type { EmployeeAuthService } from "./service";

const signInBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});
const forgotBody = z.object({ email: z.string().email().max(320) });
const resetBody = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(1024),
});

export function employeeAuthPlugin(input: {
  service: EmployeeAuthService;
  applicationOrigin: string;
  environment: "development" | "test" | "preview" | "production";
}): BetterAuthPlugin {
  const mutation = (request: Request | undefined) => {
    if (!request) throw new Error("Request context is required.");
    assertTrustedMutationOrigin(request, input.applicationOrigin);
    return normalizeRateLimitIp(
      request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for"),
    );
  };
  const cookieOptions = {
    ...secureCookieOptions(input.environment),
    maxAge: SESSION_ABSOLUTE_MILLISECONDS / 1000,
  };

  return {
    id: "quantitative-survey-employee-auth",
    endpoints: {
      employeeSignIn: createAuthEndpoint(
        "/employee/sign-in",
        { method: "POST", body: signInBody },
        async (context) => {
          try {
            const result = await input.service.signIn({
              ...context.body,
              ip: mutation(context.request),
            });
            context.setCookie(AUTH_COOKIE_NAME, result.token, cookieOptions);
            return context.json({ employee: result.employee });
          } catch (error) {
            throw safeEndpointError(context.error, error);
          }
        },
      ),
      employeeSignOut: createAuthEndpoint(
        "/employee/sign-out",
        { method: "POST" },
        async (context) => {
          try {
            mutation(context.request);
            await input.service.signOut(
              context.getCookie(AUTH_COOKIE_NAME) ?? undefined,
            );
            context.setCookie(AUTH_COOKIE_NAME, "", {
              ...cookieOptions,
              maxAge: 0,
            });
            return context.json({ success: true });
          } catch (error) {
            throw safeEndpointError(context.error, error);
          }
        },
      ),
      employeeForgotPassword: createAuthEndpoint(
        "/employee/forgot-password",
        { method: "POST", body: forgotBody },
        async (context) => {
          try {
            return context.json(
              await input.service.forgotPassword({
                email: context.body.email,
                ip: mutation(context.request),
              }),
            );
          } catch (error) {
            throw safeEndpointError(context.error, error);
          }
        },
      ),
      employeeResetPassword: createAuthEndpoint(
        "/employee/reset-password",
        { method: "POST", body: resetBody },
        async (context) => {
          try {
            await input.service.resetPassword({
              ...context.body,
              ip: mutation(context.request),
            });
            return context.json({ success: true });
          } catch (error) {
            throw safeEndpointError(context.error, error);
          }
        },
      ),
    },
  };
}

type EndpointErrorStatus =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

function safeEndpointError(
  endpointError: (
    status: EndpointErrorStatus,
    body?: { code?: string; message?: string },
  ) => unknown,
  error: unknown,
): unknown {
  if (error instanceof AppError) {
    const status =
      error.status === 400
        ? "BAD_REQUEST"
        : error.status === 401
          ? "UNAUTHORIZED"
          : error.status === 403
            ? "FORBIDDEN"
            : error.status === 429
              ? "TOO_MANY_REQUESTS"
              : "INTERNAL_SERVER_ERROR";
    return endpointError(status, {
      code: error.code,
      message: error.safeMessage,
    });
  }
  return endpointError("INTERNAL_SERVER_ERROR", {
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
  });
}
