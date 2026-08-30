import "server-only";

import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { InfrastructureAlertMailAdapter } from "./service";

export function createInfrastructureMailAdapter(input: {
  transport: "local-file" | "brevo";
  localMailboxPath?: string;
  brevoApiKey?: string;
  brevoFromEmail?: string;
  brevoFromName?: string;
  request?: typeof fetch;
}): InfrastructureAlertMailAdapter {
  return {
    async sendAlert({ recipients, crossings }) {
      if (!recipients.length) return;
      const summary = crossings
        .map((item) => `${item.provider} ${item.quota}: ${item.threshold}%`)
        .join("\n");
      if (input.transport === "brevo") {
        if (!input.brevoApiKey || !input.brevoFromEmail || !input.brevoFromName)
          throw new Error("Brevo alert transport is not configured.");
        try {
          const response = await (input.request ?? fetch)(
            "https://api.brevo.com/v3/smtp/email",
            {
              method: "POST",
              headers: {
                accept: "application/json",
                "api-key": input.brevoApiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                sender: {
                  email: input.brevoFromEmail,
                  name: input.brevoFromName,
                },
                to: recipients.map((email) => ({ email })),
                subject: "Infrastructure free-tier usage alert",
                textContent: `Application-observed infrastructure thresholds were crossed:\n\n${summary}\n\nReview the provider dashboards. Estimates are not provider-actual values.`,
              }),
            },
          );
          if (!response.ok) throw new Error();
        } catch {
          throw new Error("Infrastructure alert failed.");
        }
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
