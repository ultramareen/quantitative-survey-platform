import "server-only";

import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Resend } from "resend";

export type PasswordResetMail = {
  recipient: string;
  resetUrl: string;
  expiresAt: Date;
};

export interface AuthMailAdapter {
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
}

export class LocalFileMailAdapter implements AuthMailAdapter {
  constructor(private readonly mailboxPath: string) {}

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    await mkdir(dirname(this.mailboxPath), { recursive: true });
    await appendFile(
      this.mailboxPath,
      JSON.stringify({
        type: "password-reset",
        recipient: message.recipient,
        resetUrl: message.resetUrl,
        expiresAt: message.expiresAt.toISOString(),
      }) + "\n",
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(this.mailboxPath, 0o600);
  }
}

export class ResendMailAdapter implements AuthMailAdapter {
  readonly #client: Resend;

  constructor(
    apiKey: string,
    private readonly sender: string,
  ) {
    this.#client = new Resend(apiKey);
  }

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    const result = await this.#client.emails.send({
      from: this.sender,
      to: message.recipient,
      subject: "Reset your Quantitative Survey Platform password",
      text: `Use this link within 30 minutes to reset your password:\n\n${message.resetUrl}\n\nIf you did not request this, you can ignore this message.`,
    });
    if (result.error) throw new Error("Password reset email delivery failed.");
  }
}

export function createAuthMailAdapter(input: {
  transport: "local-file" | "resend";
  localMailboxPath?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
}): AuthMailAdapter {
  if (input.transport === "resend") {
    if (!input.resendApiKey || !input.resendFromEmail) {
      throw new Error("Resend mail transport is not configured.");
    }
    return new ResendMailAdapter(input.resendApiKey, input.resendFromEmail);
  }
  return new LocalFileMailAdapter(
    input.localMailboxPath ?? "/tmp/qsp-local-password-reset-mailbox.jsonl",
  );
}
