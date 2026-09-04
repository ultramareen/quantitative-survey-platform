// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RespondentFilters } from "@/components/respondents/respondent-filters";
import { RespondentResults } from "@/components/respondents/respondent-results";
import type { RespondentPiiDto } from "@/types/respondent-pii";

const surveyA = "00000000-0000-4000-8000-00000000000a";
const surveyB = "00000000-0000-4000-8000-00000000000b";

afterEach(() => vi.restoreAllMocks());

describe("respondent survey filtering", () => {
  it("submits the selected survey immediately and keeps the reference filter", () => {
    const submissions: Record<string, FormDataEntryValue>[] = [];
    vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(
      function (this: HTMLFormElement) {
        submissions.push(Object.fromEntries(new FormData(this)));
      },
    );
    render(
      <RespondentFilters
        referenceId="R-7K3M9W2X8Q4D"
        surveys={[
          { id: surveyA, title: "Survey A" },
          { id: surveyB, title: "Survey B" },
        ]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Survey" });
    fireEvent.change(select, { target: { value: surveyA } });
    fireEvent.change(select, { target: { value: surveyB } });

    expect(submissions).toEqual([
      { referenceId: "R-7K3M9W2X8Q4D", surveyId: surveyA },
      { referenceId: "R-7K3M9W2X8Q4D", surveyId: surveyB },
    ]);
  });

  it("replaces prior-survey rows and count when server results change", () => {
    const { rerender } = render(
      <RespondentResults
        respondents={[respondent("R-AAAAAAAAAAAA", surveyA, "Survey A")]}
        total={1}
      />,
    );
    expect(screen.getByText("R-AAAAAAAAAAAA")).toBeInTheDocument();
    expect(screen.getByText("1 respondent")).toBeInTheDocument();

    rerender(
      <RespondentResults
        respondents={[
          respondent("R-BBBBBBBBBBBB", surveyB, "Survey B"),
          respondent("R-CCCCCCCCCCCC", surveyB, "Survey B"),
        ]}
        total={2}
      />,
    );
    expect(screen.queryByText("R-AAAAAAAAAAAA")).not.toBeInTheDocument();
    expect(screen.getByText("R-BBBBBBBBBBBB")).toBeInTheDocument();
    expect(screen.getByText("2 respondents")).toBeInTheDocument();
  });

  it("shows the filtered zero-result count and empty state", () => {
    render(<RespondentResults respondents={[]} total={0} />);
    expect(screen.getByText("0 respondents")).toBeInTheDocument();
    expect(
      screen.getByText("No respondents matched this view."),
    ).toBeInTheDocument();
  });
});

function respondent(
  referenceId: string,
  surveyId: string,
  surveyTitle: string,
): RespondentPiiDto {
  return {
    referenceId,
    name: "Synthetic Person",
    phone: "+12025550123",
    survey: { id: surveyId, title: surveyTitle, status: "ACTIVE" },
    coverage: { answeredQuestions: 1, totalQuestions: 1, percentage: 100 },
    startedAt: null,
    lastAnswerChangedAt: null,
    identifiedAt: "2026-09-04T00:00:00.000Z",
    lastActivityAt: "2026-09-04T00:00:00.000Z",
    state: "EDITABLE",
  };
}
