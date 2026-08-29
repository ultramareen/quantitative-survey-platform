// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SurveyResults } from "@/components/results/survey-results";
import type { ResultsSnapshotDto } from "@/types/results";

const snapshot: ResultsSnapshotDto = {
  snapshotNumber: 2,
  dataCutoffAt: "2026-08-29T10:00:00.000Z",
  createdAt: "2026-08-29T10:00:01.000Z",
  funnel: {
    opened: 1,
    identified: 1,
    currentAttempts: 1,
    started: 1,
    startedPercentage: 100,
    greaterThanHalf: 1,
    greaterThanHalfPercentage: 100,
    completed: 1,
    completedPercentage: 100,
  },
  questions: [
    {
      position: 1,
      prompt: "Explain",
      type: "FREE_TEXT",
      denominator: 1,
      freeTextGroups: [],
      uniqueGroupCount: 11,
      truncated: true,
    },
  ],
};

describe("Phase 11 export UI", () => {
  it("shows Product Manager only the aggregate snapshot action", () => {
    render(
      <SurveyResults
        surveyId="survey"
        initial={[snapshot]}
        canCalculate
        canExportRespondents={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Aggregate snapshot" }),
    ).toHaveAttribute(
      "href",
      "/api/surveys/survey/exports/aggregate?snapshotNumber=2",
    );
    expect(screen.queryByText("Current Raw")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Attempts")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Export respondent-level free text"),
    ).not.toBeInTheDocument();
  });

  it("shows separate Researcher/Admin respondent export choices and partition guidance", () => {
    render(
      <SurveyResults
        surveyId="survey"
        initial={[snapshot]}
        canCalculate
        canExportRespondents
      />,
    );
    expect(
      screen.getByRole("link", { name: "Current Raw" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Archived Attempts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Export respondent-level free text" }),
    ).toHaveAttribute(
      "href",
      "/api/surveys/survey/exports/free-text?questionPosition=1",
    );
    expect(screen.getByText(/deterministic bounded parts/)).toBeInTheDocument();
    expect(
      screen.getByText(/timestamped current-state files/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/download the remaining files/),
    ).toBeInTheDocument();
  });
});
