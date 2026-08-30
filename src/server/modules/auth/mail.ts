import "server-only";

import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type PasswordResetMail = {
  recipient: string;
  resetUrl: string;
  expiresAt: Date;
};

export type InvitationMail = {
  recipient: string;
  invitationUrl: string;
  expiresAt: Date;
};

export interface InvitationMailAdapter {
  sendInvitation(message: InvitationMail): Promise<void>;
}

export interface AuthMailAdapter {
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
}

export class LocalFileMailAdapter implements AuthMailAdapter {
  constructor(private readonly mailboxPath: string) {}

  async sendInvitation(message: InvitationMail): Promise<void> {
    await this.append({
      type: "employee-invitation",
      recipient: message.recipient,
      invitationUrl: message.invitationUrl,
      expiresAt: message.expiresAt.toISOString(),
    });
  }

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    await this.append({
      type: "password-reset",
      recipient: message.recipient,
      resetUrl: message.resetUrl,
      expiresAt: message.expiresAt.toISOString(),
    });
  }

  private async append(message: Record<string, string>) {
    await mkdir(dirname(this.mailboxPath), { recursive: true });
    await appendFile(this.mailboxPath, JSON.stringify(message) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(this.mailboxPath, 0o600);
  }
}

export class BrevoMailAdapter implements AuthMailAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly sender: { email: string; name: string },
    private readonly onDelivered?: () => Promise<void>,
    private readonly request: typeof fetch = fetch,
  ) {}

  async sendInvitation(message: InvitationMail): Promise<void> {
    await this.send({
      to: [{ email: message.recipient }],
      subject: "Your Quantitative Survey Platform invitation",
      textContent: `Use this one-time link within 72 hours to create your account:\n\n${message.invitationUrl}\n\nIf you were not expecting this, you can ignore this message.`,
      failureMessage: "Invitation email delivery failed.",
    });
    await this.onDelivered?.();
  }

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    await this.send({
      to: [{ email: message.recipient }],
      subject: "Reset your Quantitative Survey Platform password",
      textContent: `Use this link within 30 minutes to reset your password:\n\n${message.resetUrl}\n\nIf you did not request this, you can ignore this message.`,
      failureMessage: "Password reset email delivery failed.",
    });
    await this.onDelivered?.();
  }

  private async send(input: {
    to: { email: string }[];
    subject: string;
    textContent: string;
    failureMessage: string;
  }) {
    try {
      const response = await this.request(
        "https://api.brevo.com/v3/smtp/email",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": this.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: this.sender,
            to: input.to,
            subject: input.subject,
            textContent: input.textContent,
          }),
        },
      );
      if (!response.ok) throw new Error(input.failureMessage);
    } catch {
      throw new Error(input.failureMessage);
    }
  }
}

export function createAuthMailAdapter(input: {
  transport: "local-file" | "brevo";
  localMailboxPath?: string;
  brevoApiKey?: string;
  brevoFromEmail?: string;
  brevoFromName?: string;
  onBrevoDelivered?: () => Promise<void>;
}): AuthMailAdapter & InvitationMailAdapter {
  if (input.transport === "brevo") {
    if (!input.brevoApiKey || !input.brevoFromEmail || !input.brevoFromName) {
      throw new Error("Brevo mail transport is not configured.");
    }
    return new BrevoMailAdapter(
      input.brevoApiKey,
      { email: input.brevoFromEmail, name: input.brevoFromName },
      input.onBrevoDelivered,
    );
  }
  return new LocalFileMailAdapter(
    input.localMailboxPath ?? "/tmp/qsp-local-password-reset-mailbox.jsonl",
  );
}
