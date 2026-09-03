// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfrastructureUsageHeadline } from "@/components/infrastructure/usage-headline";
import { InfrastructureAdminControls } from "@/components/infrastructure/admin-controls";

const headline = {
  percent: 99,
  provider: "NETLIFY",
  quota: "CREDITS",
  source: "APPLICATION_ESTIMATE" as const,
  updatedAt: "2026-08-29T12:00:00.000Z",
  stale: false,
  tone: "critical" as const,
};

describe("Phase 12 infrastructure UI", () => {
  it("clearly labels cached estimates, source, and provider authority", () => {
    render(<InfrastructureUsageHeadline value={headline} />);
    expect(
      screen.getByText("Estimated Infrastructure Usage — 99%"),
    ).toBeInTheDocument();
    expect(screen.getByText(/not provider-actual/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "99",
    );
  });
  it("keeps quota monitoring and capacity selection without manual reconciliation or the survey bulk action", () => {
    render(
      <InfrastructureAdminControls
        view={{
          headline,
          quotas: [
            {
              provider: "NETLIFY",
              quota: "CREDITS",
              used: 297,
              limit: 300,
              percent: 99,
              source: "MANUAL_ACTUAL",
              period: "2026-08",
              resetsAt: null,
              updatedAt: headline.updatedAt,
              stale: false,
              providerConsoleUrl: "https://app.netlify.com/teams",
              drivesProtection: true,
            },
          ],
          activeSurveys: [
            {
              publicId: "safe-public",
              title: "Selected survey",
              ownerName: "Synthetic Owner",
            },
          ],
          pendingSurveys: [
            {
              publicId: "safe-pending",
              title: "Paused survey",
              ownerName: "Synthetic Owner",
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("remains active");
    expect(screen.getByRole("link", { name: "Open provider" })).toHaveAttribute(
      "href",
      "https://app.netlify.com/teams",
    );
    expect(
      screen.getByText(/free-tier limits that keep this service/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause all active surveys" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Manual provider-dashboard reconciliation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Provider quota")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save dated manual actual" }),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("00000000-");
  });
  it("keeps the automated quota empty state without an empty manual UI container", () => {
    render(
      <InfrastructureAdminControls
        view={{
          headline: { ...headline, percent: 0 },
          quotas: [],
          activeSurveys: [],
          pendingSurveys: [],
        }}
      />,
    );
    expect(
      screen.getByText(/No quota readings are available yet/),
    ).toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
  });
});
