import { describe, expect, it, vi } from "vitest";

import { createInfrastructureMailAdapter } from "@/server/modules/infrastructure/mail";

describe("Brevo infrastructure alert adapter", () => {
  it("sends one accepted request containing every admin recipient", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    const adapter = createInfrastructureMailAdapter({
      transport: "brevo",
      brevoApiKey: "synthetic-secret-key",
      brevoFromEmail: "sender@synthetic.invalid",
      brevoFromName: "Survey Platform",
      request,
    });
    await adapter.sendAlert({
      recipients: ["one@synthetic.invalid", "two@synthetic.invalid"],
      crossings: [
        {
          provider: "BREVO",
          quota: "DAILY_EMAILS",
          period: "2026-08-30",
          threshold: 75,
        },
      ],
      readings: [],
    });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual([
      { email: "one@synthetic.invalid" },
      { email: "two@synthetic.invalid" },
    ]);
    expect(body.textContent).not.toContain("synthetic-secret-key");
  });
});
