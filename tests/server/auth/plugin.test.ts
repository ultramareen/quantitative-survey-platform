import { betterAuth } from "better-auth";
import { describe, expect, it, vi } from "vitest";

import { employeeAuthPlugin } from "@/server/modules/auth/plugin";
import type { EmployeeAuthService } from "@/server/modules/auth/service";

function request(path: string, body?: object, cookie?: string) {
  return new Request(`https://survey.example.com/api/auth${path}`, {
    method: "POST",
    headers: {
      host: "survey.example.com",
      origin: "https://survey.example.com",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function fixture() {
  const service = {
    signIn: vi.fn().mockResolvedValue({
      token: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      employee: {
        id: "employee-1",
        email: "admin@synthetic.invalid",
        displayName: "Synthetic Admin",
        role: "ADMIN",
        authorizationVersion: 1,
      },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    forgotPassword: vi.fn().mockResolvedValue({ message: "Generic response" }),
    resetPassword: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmployeeAuthService;
  const auth = betterAuth({
    baseURL: "https://survey.example.com/api/auth",
    secret: "synthetic-better-auth-secret-at-least-32-characters",
    trustedOrigins: ["https://survey.example.com"],
    emailAndPassword: { enabled: false },
    disabledPaths: ["/sign-up/email"],
    plugins: [
      employeeAuthPlugin({
        service,
        applicationOrigin: "https://survey.example.com",
        environment: "production",
      }),
    ],
  });
  return { auth, service };
}

describe("Better Auth employee plugin boundary", () => {
  it("sets a host-only secure session cookie with the approved attributes", async () => {
    const { auth } = fixture();
    const response = await auth.handler(
      request("/employee/sign-in", {
        email: "admin@synthetic.invalid",
        password: "synthetic password",
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("qsp_employee_session=");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("rejects untrusted mutation hosts before invoking credentials", async () => {
    const { auth, service } = fixture();
    const untrusted = request("/employee/sign-in", {
      email: "admin@synthetic.invalid",
      password: "synthetic password",
    });
    untrusted.headers.set("host", "attacker.example");
    const response = await auth.handler(untrusted);
    expect(response.status).toBe(403);
    expect(service.signIn).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/employee/sign-in",
      { email: "admin@synthetic.invalid", password: "synthetic password" },
      "signIn",
    ],
    ["/employee/sign-out", undefined, "signOut"],
    [
      "/employee/forgot-password",
      { email: "admin@synthetic.invalid" },
      "forgotPassword",
    ],
    [
      "/employee/reset-password",
      { token: "A".repeat(43), newPassword: "synthetic replacement" },
      "resetPassword",
    ],
  ] as const)(
    "rejects an untrusted Origin on %s before invoking the service",
    async (path, body, method) => {
      const { auth, service } = fixture();
      const untrusted = request(path, body);
      untrusted.headers.set("origin", "https://attacker.example");
      untrusted.headers.set("sec-fetch-site", "cross-site");
      const response = await auth.handler(untrusted);
      expect(response.status).toBe(403);
      expect(service[method]).not.toHaveBeenCalled();
    },
  );

  it("revokes the cookie-backed session and expires the cookie on logout", async () => {
    const { auth, service } = fixture();
    const response = await auth.handler(
      request(
        "/employee/sign-out",
        undefined,
        "qsp_employee_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    );
    expect(response.status).toBe(200);
    expect(service.signOut).toHaveBeenCalledWith(
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("does not expose an open email registration endpoint", async () => {
    const { auth } = fixture();
    const response = await auth.handler(
      request("/sign-up/email", {
        name: "Uninvited",
        email: "uninvited@synthetic.invalid",
        password: "synthetic password",
      }),
    );
    expect(response.status).toBe(404);
  });
});
