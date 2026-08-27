import "server-only";

import {
  generateSecureToken,
  hashPassword,
  hashSecureToken,
} from "@/server/modules/cryptography";
import { normalizeEmployeeEmail } from "@/server/modules/auth/normalize-email";
import { requireRole } from "@/server/modules/auth/policies";
import type {
  EmployeePrincipal,
  EmployeeRole,
} from "@/server/modules/auth/types";
import type { InvitationMailAdapter } from "@/server/modules/auth/mail";
import type { EmployeeManagementRepository } from "./repository";

export const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000;
const ROLES: EmployeeRole[] = ["PRODUCT_MANAGER", "RESEARCHER", "ADMIN"];

export class EmployeeManagementService {
  constructor(
    private readonly repository: EmployeeManagementRepository,
    private readonly mail: InvitationMailAdapter,
    private readonly origin: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(actor: EmployeePrincipal | null) {
    requireRole(actor, ["ADMIN"]);
    return this.repository.list();
  }

  async createInvitation(
    actor: EmployeePrincipal | null,
    input: { email: string; role: EmployeeRole },
  ) {
    const admin = requireRole(actor, ["ADMIN"]);
    const email = validEmail(input.email);
    validRole(input.role);
    const now = this.clock();
    const token = generateSecureToken();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const invitationId = await this.repository.createInvitation({
      actorId: admin.id,
      email,
      role: input.role,
      tokenHash: hashSecureToken(token),
      expiresAt,
      now,
    });
    await this.send(email, token, expiresAt);
    return { invitationId, expiresAt };
  }

  async preview(token: string) {
    return this.repository.previewInvitation(
      validTokenHash(token),
      this.clock(),
    );
  }

  async accept(input: {
    token: string;
    displayName: string;
    password: string;
    passwordConfirmation: string;
    email?: unknown;
    role?: unknown;
  }) {
    if (input.email !== undefined || input.role !== undefined)
      throw bad(
        "Email and role cannot be supplied during invitation acceptance.",
      );
    const displayName = input.displayName.trim();
    if (
      !displayName ||
      displayName.length > 200 ||
      input.password.length < 12 ||
      input.password !== input.passwordConfirmation
    )
      throw bad("Invitation registration details are invalid.");
    const passwordHash = await hashPassword(input.password);
    return this.repository.acceptInvitation({
      tokenHash: validTokenHash(input.token),
      displayName,
      passwordHash,
      now: this.clock(),
    });
  }

  async resend(actor: EmployeePrincipal | null, invitationId: string) {
    const admin = requireRole(actor, ["ADMIN"]);
    const now = this.clock();
    const token = generateSecureToken();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const email = await this.repository.resendInvitation({
      actorId: admin.id,
      invitationId,
      tokenHash: hashSecureToken(token),
      expiresAt,
      now,
    });
    await this.send(email, token, expiresAt);
    return { expiresAt };
  }
  async disableInvitation(
    actor: EmployeePrincipal | null,
    invitationId: string,
  ) {
    const admin = requireRole(actor, ["ADMIN"]);
    await this.repository.disableInvitation({
      actorId: admin.id,
      invitationId,
      now: this.clock(),
    });
  }
  async changeRole(
    actor: EmployeePrincipal | null,
    userId: string,
    role: EmployeeRole,
  ) {
    const admin = requireRole(actor, ["ADMIN"]);
    validRole(role);
    await this.repository.changeRole({
      actorId: admin.id,
      userId,
      role,
      now: this.clock(),
    });
  }
  async disableEmployee(actor: EmployeePrincipal | null, userId: string) {
    const admin = requireRole(actor, ["ADMIN"]);
    await this.repository.disableEmployee({
      actorId: admin.id,
      userId,
      now: this.clock(),
    });
  }
  async reenableEmployee(actor: EmployeePrincipal | null, userId: string) {
    const admin = requireRole(actor, ["ADMIN"]);
    await this.repository.reenableEmployee({
      actorId: admin.id,
      userId,
      now: this.clock(),
    });
  }

  private async send(email: string, token: string, expiresAt: Date) {
    const url = new URL("/accept-invitation", this.origin);
    url.searchParams.set("token", token);
    await this.mail.sendInvitation({
      recipient: email,
      invitationUrl: url.toString(),
      expiresAt,
    });
  }
}

function validEmail(value: string) {
  const email = normalizeEmployeeEmail(value);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320)
    throw bad("A valid employee email is required.");
  return email;
}
function validRole(role: EmployeeRole) {
  if (!ROLES.includes(role)) throw bad("Employee role is invalid.");
}
function validTokenHash(token: string) {
  try {
    if (!/^[A-Za-z0-9_-]{40,256}$/.test(token)) throw new Error();
    return hashSecureToken(token);
  } catch {
    throw bad("This invitation is invalid, expired, or unavailable.");
  }
}
function bad(message: string) {
  return Object.assign(new Error(message), {
    code: "INVALID_EMPLOYEE_REQUEST",
    status: 400,
  });
}
