import { describe, expect, it, vi } from "vitest";

import { BrevoMailAdapter } from "@/server/modules/auth/mail";

const sender = { email: "sender@synthetic.invalid", name: "Survey Platform" };

describe("Brevo transactional mail adapter", () => {
  it("sends invitations through the Brevo API and counts accepted recipients", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    const delivered = vi.fn().mockResolvedValue(undefined);
    const adapter = new BrevoMailAdapter(
      "synthetic-secret-key",
      sender,
      delivered,
      request,
    );

    await adapter.sendInvitation({
      recipient: "employee@synthetic.invalid",
      invitationUrl: "https://survey.synthetic.invalid/invite/token",
      expiresAt: new Date("2026-08-30T12:00:00Z"),
    });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers).toMatchObject({ "api-key": "synthetic-secret-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender,
      to: [{ email: "employee@synthetic.invalid" }],
      subject: "Your Quantitative Survey Platform invitation",
    });
    expect(delivered).toHaveBeenCalledOnce();
  });

  it.each([400, 429, 500])(
    "does not count a rejected password reset (%s)",
    async (status) => {
      const request = vi
        .fn()
        .mockResolvedValue(new Response("provider detail", { status }));
      const delivered = vi.fn();
      const adapter = new BrevoMailAdapter(
        "secret-that-must-not-escape",
        sender,
        delivered,
        request,
      );
      await expect(
        adapter.sendPasswordReset({
          recipient: "employee@synthetic.invalid",
          resetUrl: "https://survey.synthetic.invalid/reset/token",
          expiresAt: new Date("2026-08-30T12:00:00Z"),
        }),
      ).rejects.toThrow("Password reset email delivery failed.");
      expect(delivered).not.toHaveBeenCalled();
    },
  );

  it("does not expose provider or credential details on network failure", async () => {
    const adapter = new BrevoMailAdapter(
      "secret-that-must-not-escape",
      sender,
      undefined,
      vi.fn().mockRejectedValue(new Error("network detail")),
    );
    await expect(
      adapter.sendInvitation({
        recipient: "employee@synthetic.invalid",
        invitationUrl: "https://survey.synthetic.invalid/invite/token",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(/^Invitation email delivery failed\.$/);
  });
});
