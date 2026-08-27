import { describe, expect, it } from "vitest";
import { hashSecureToken } from "@/server/modules/cryptography";
import type {
  InvitationMail,
  InvitationMailAdapter,
} from "@/server/modules/auth/mail";
import type { EmployeePrincipal } from "@/server/modules/auth/types";
import type { EmployeeManagementRepository } from "@/server/modules/employees/repository";
import {
  EmployeeManagementService,
  INVITATION_LIFETIME_MS,
} from "@/server/modules/employees/service";

const admin: EmployeePrincipal = {
  id: "admin",
  email: "admin@example.com",
  displayName: "Admin",
  role: "ADMIN",
  authorizationVersion: 1,
};
const pm: EmployeePrincipal = { ...admin, id: "pm", role: "PRODUCT_MANAGER" };
const researcher: EmployeePrincipal = {
  ...admin,
  id: "researcher",
  role: "RESEARCHER",
};
class Mail implements InvitationMailAdapter {
  messages: InvitationMail[] = [];
  async sendInvitation(message: InvitationMail) {
    this.messages.push(message);
  }
}
class Repo implements EmployeeManagementRepository {
  created?: Parameters<EmployeeManagementRepository["createInvitation"]>[0];
  resent?: Parameters<EmployeeManagementRepository["resendInvitation"]>[0];
  async list() {
    return [];
  }
  async createInvitation(
    input: Parameters<EmployeeManagementRepository["createInvitation"]>[0],
  ) {
    this.created = input;
    return "invitation";
  }
  async previewInvitation() {
    return null;
  }
  async acceptInvitation() {
    return { userId: "user" };
  }
  async resendInvitation(
    input: Parameters<EmployeeManagementRepository["resendInvitation"]>[0],
  ) {
    this.resent = input;
    return "employee@example.com";
  }
  async disableInvitation() {}
  async changeRole() {}
  async disableEmployee() {}
  async reenableEmployee() {}
}
function fixture() {
  const repo = new Repo();
  const mail = new Mail();
  const now = new Date("2026-08-27T12:00:00Z");
  return {
    repo,
    mail,
    service: new EmployeeManagementService(
      repo,
      mail,
      "https://survey.example.com",
      () => now,
    ),
    now,
  };
}

describe("employee management service", () => {
  it("allows Admin creation with normalized email, hash-only token and exact 72-hour expiry", async () => {
    const { repo, mail, service, now } = fixture();
    await service.createInvitation(admin, {
      email: " Employee@Example.COM ",
      role: "RESEARCHER",
    });
    expect(repo.created?.email).toBe("employee@example.com");
    expect(repo.created!.expiresAt.getTime() - now.getTime()).toBe(
      INVITATION_LIFETIME_MS,
    );
    const message = mail.messages[0];
    expect(message).toBeDefined();
    const token = new URL(message!.invitationUrl).searchParams.get("token")!;
    expect(repo.created?.tokenHash.equals(hashSecureToken(token))).toBe(true);
    expect(JSON.stringify(repo.created)).not.toContain(token);
  });
  it.each([pm, researcher, null])(
    "denies Product Manager, Researcher, and unauthenticated initial or re-invitation management",
    async (actor) => {
      const { repo, service } = fixture();
      await expect(
        service.createInvitation(actor, {
          email: "employee@example.com",
          role: "ADMIN",
        }),
      ).rejects.toMatchObject({
        code: actor ? "FORBIDDEN" : "AUTHENTICATION_REQUIRED",
      });
      expect(repo.created).toBeUndefined();
    },
  );
  it("rotates tokens on resend and never returns the raw token", async () => {
    const { repo, mail, service, now } = fixture();
    const result = await service.resend(admin, "invitation");
    expect(result.expiresAt.getTime() - now.getTime()).toBe(
      INVITATION_LIFETIME_MS,
    );
    const token = new URL(mail.messages[0]!.invitationUrl).searchParams.get(
      "token",
    )!;
    expect(repo.resent?.tokenHash.equals(hashSecureToken(token))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("rejects browser-supplied email or role during acceptance", async () => {
    const { service } = fixture();
    for (const extra of [{ email: "attacker@example.com" }, { role: "ADMIN" }])
      await expect(
        service.accept({
          token: "A".repeat(43),
          displayName: "Employee",
          password: "long synthetic password",
          passwordConfirmation: "long synthetic password",
          ...extra,
        }),
      ).rejects.toMatchObject({ code: "INVALID_EMPLOYEE_REQUEST" });
  });
});
