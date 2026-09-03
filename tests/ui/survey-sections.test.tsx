// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SurveySections } from "@/components/surveys/survey-sections";
import type { SurveyStatus, SurveySummary } from "@/types/survey";

function survey(id: string, status: SurveyStatus): SurveySummary {
  return {
    id,
    publicId: `public-${id}`,
    ownerId: "owner",
    ownerName: "Owner",
    title: `${status} ${id}`,
    description: null,
    status,
    pauseReason: status === "PENDING_CAPACITY" ? "MANUAL" : null,
    stateVersion: 1,
    questionCount: 1,
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: new Date("2026-09-03T00:00:00Z"),
    launchedAt: null,
    pausedAt: null,
    completedAt: null,
  };
}

describe("survey status sections", () => {
  it("hides the Paused section when no survey is paused", () => {
    render(<SurveySections surveys={[survey("one", "ACTIVE")]} />);
    expect(
      screen.getByRole("heading", { name: "Active Surveys" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Paused Surveys" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
  });

  it("renders paused surveys only in a separate section with a Paused status", () => {
    const { rerender } = render(
      <SurveySections
        surveys={[
          survey("active", "ACTIVE"),
          survey("paused", "PENDING_CAPACITY"),
        ]}
      />,
    );
    const active = screen
      .getByRole("heading", { name: "Active Surveys" })
      .closest("section")!;
    const paused = screen
      .getByRole("heading", { name: "Paused Surveys" })
      .closest("section")!;
    expect(within(active).getByText("ACTIVE active")).toBeInTheDocument();
    expect(
      within(active).queryByText("PENDING_CAPACITY paused"),
    ).not.toBeInTheDocument();
    expect(
      within(paused).getByText("PENDING_CAPACITY paused"),
    ).toBeInTheDocument();
    expect(within(paused).getByText("Paused")).toBeInTheDocument();
    expect(screen.getAllByText("PENDING_CAPACITY paused")).toHaveLength(1);

    rerender(
      <SurveySections
        surveys={[
          survey("active", "PENDING_CAPACITY"),
          survey("paused", "PENDING_CAPACITY"),
        ]}
      />,
    );
    const regroupedActive = screen
      .getByRole("heading", { name: "Active Surveys" })
      .closest("section")!;
    const regroupedPaused = screen
      .getByRole("heading", { name: "Paused Surveys" })
      .closest("section")!;
    expect(
      within(regroupedActive).getByText("No active surveys."),
    ).toBeInTheDocument();
    expect(
      within(regroupedPaused).getAllByText(/^PENDING_CAPACITY/),
    ).toHaveLength(2);
  });
});
