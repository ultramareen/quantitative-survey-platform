// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("keeps question controls together and places add-question before final actions", () => {
    const { container } = render(
      <SurveyBuilder finalActions={<button type="button">Activate</button>} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const question = screen.getByRole("group", { name: "Question 1" });
    expect(
      within(question).getByRole("button", { name: "Add option" }),
    ).toHaveClass("bg-emerald-700");
    expect(
      within(question).getByRole("button", { name: "Move up" }),
    ).toBeInTheDocument();
    const addQuestion = screen.getByRole("button", { name: "Add question" });
    const finalActions = screen.getByRole("group", {
      name: "Survey final actions",
    });
    expect(addQuestion.compareDocumentPosition(finalActions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(finalActions).getByRole("button", { name: "Save Draft" }),
    ).toHaveClass("bg-slate-200");
    expect(
      within(finalActions).getByRole("button", { name: "Activate" }),
    ).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it("reorders options within a question with an accessible keyboard alternative", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const first = screen.getByLabelText("Question 1 option 1");
    const second = screen.getByLabelText("Question 1 option 2");
    fireEvent.change(first, { target: { value: "First" } });
    fireEvent.change(second, { target: { value: "Second" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Move question 1 option 2 up" }),
    );
    expect(screen.getByLabelText("Question 1 option 1")).toHaveValue("Second");
    expect(screen.getByLabelText("Question 1 option 2")).toHaveValue("First");
    expect(
      screen.getByRole("button", { name: "Drag question 1 option 1" }),
    ).toHaveAttribute("draggable", "true");
  });

  it("rejects option drops from another question", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question 1 option 1"), {
      target: { value: "Question one" },
    });
    fireEvent.change(screen.getByLabelText("Question 2 option 1"), {
      target: { value: "Question two" },
    });
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      types: ["application/x-survey-option"],
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };
    fireEvent.dragStart(
      screen.getByRole("button", { name: "Drag question 1 option 1" }),
      { dataTransfer },
    );
    fireEvent.drop(
      screen
        .getByLabelText("Question 2 option 1")
        .closest("[data-option-index]")!,
      { dataTransfer },
    );
    expect(screen.getByLabelText("Question 1 option 1")).toHaveValue(
      "Question one",
    );
    expect(screen.getByLabelText("Question 2 option 1")).toHaveValue(
      "Question two",
    );
  });

  it("saves the reordered option array in its visible order", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<SurveyBuilder survey={{ ...draft, title: "Ordered" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question 1 option 1"), {
      target: { value: "First" },
    });
    fireEvent.change(screen.getByLabelText("Question 1 option 2"), {
      target: { value: "Second" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Move question 1 option 2 up" }),
    );
    fireEvent.change(screen.getByLabelText("Question text"), {
      target: { value: "Question" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(String(request.body)).questions[0].options).toEqual([
      "Second",
      "First",
    ]);
    fetchMock.mockRestore();
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
