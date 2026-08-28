// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SurveyBuilder } from "@/components/surveys/survey-builder";
import type { SurveyDetail } from "@/types/survey";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("survey builder UI", () => {
  const draft: SurveyDetail = {
    id: "survey",
    publicId: "public",
    ownerId: "owner",
    ownerName: "Owner",
    title: "Draft survey",
    description: null,
    status: "DRAFT",
    pauseReason: null,
    stateVersion: 1,
    questionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    launchedAt: null,
    pausedAt: null,
    completedAt: null,
    questions: [],
  };
  it("authors ordered required/optional questions and answer options", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    expect(
      screen.getByRole("group", { name: "Question 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    expect(screen.getByText("Answer options (3/11)")).toBeInTheDocument();
  });

  it("makes free-text configuration obvious and removes incompatible options", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question type"), {
      target: { value: "FREE_TEXT" },
    });
    expect(
      screen.getByText(/This type has no answer options/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add option" }),
    ).not.toBeInTheDocument();
  });

  it("renders an editable Draft for an authorized owner or Admin", () => {
    render(<SurveyBuilder survey={draft} />);
    expect(screen.getByRole("button", { name: "Add question" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("renders a Draft read-only when the server page denies editing", () => {
    render(<SurveyBuilder survey={draft} readOnly />);
    expect(
      screen.queryByRole("button", { name: "Add question" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save Draft" }),
    ).not.toBeInTheDocument();
  });
});
