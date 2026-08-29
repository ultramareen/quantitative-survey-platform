import "server-only";

import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Resend } from "resend";
import type { InfrastructureAlertMailAdapter } from "./service";

export function createInfrastructureMailAdapter(input: {
  transport: "local-file" | "resend";
  localMailboxPath?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
}): InfrastructureAlertMailAdapter {
  return {
    async sendAlert({ recipients, crossings }) {
      if (!recipients.length) return;
      const summary = crossings
        .map((item) => `${item.provider} ${item.quota}: ${item.threshold}%`)
        .join("\n");
      if (input.transport === "resend") {
        if (!input.resendApiKey || !input.resendFromEmail)
          throw new Error("Resend alert transport is not configured.");
        const result = await new Resend(input.resendApiKey).emails.send({
          from: input.resendFromEmail,
          to: recipients,
          subject: "Infrastructure free-tier usage alert",
          text: `Application-observed infrastructure thresholds were crossed:\n\n${summary}\n\nReview the provider dashboards. Estimates are not provider-actual values.`,
        });
        if (result.error) throw new Error("Infrastructure alert failed.");
        return;
      }
      const path =
        input.localMailboxPath ?? "/tmp/qsp-local-password-reset-mailbox.jsonl";
      await mkdir(dirname(path), { recursive: true });
      await appendFile(
        path,
        JSON.stringify({
          type: "infrastructure-alert",
          recipients,
          crossings,
        }) + "\n",
        { encoding: "utf8", mode: 0o600 },
      );
      await chmod(path, 0o600);
    },
  };
}
