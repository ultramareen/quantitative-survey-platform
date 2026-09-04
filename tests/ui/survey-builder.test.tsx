// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SurveyBuilder } from "@/components/surveys/survey-builder";
import type { SurveyDetail } from "@/types/survey";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    get types() {
      return [...values.keys()];
    },
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
  };
}

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
    const { container } = render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const question = screen.getByRole("group", { name: "Question 1" });
    expect(
      within(question).getByRole("button", { name: "Add option" }),
    ).toHaveClass("ui-primary");
    expect(
      within(question).queryByRole("button", { name: /Move (up|down)/ }),
    ).not.toBeInTheDocument();
    const addQuestion = screen.getByRole("button", { name: "Add question" });
    const finalActions = screen.getByRole("group", {
      name: "Survey final actions",
    });
    expect(addQuestion.compareDocumentPosition(finalActions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(finalActions).getByRole("button", { name: "Save Draft" }),
    ).toHaveClass("ui-secondary");
    expect(
      within(finalActions).getByRole("button", { name: "Activate" }),
    ).toHaveClass("ui-primary");
    expect(container).toBeTruthy();
  });

  it("reorders by dragging the option block without arrows or a drag handle", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const first = screen.getByLabelText("Question 1 option 1");
    const second = screen.getByLabelText("Question 1 option 2");
    fireEvent.change(first, { target: { value: "First" } });
    fireEvent.change(second, { target: { value: "Second" } });
    const transfer = dataTransfer();
    const secondBlock = second.closest("[data-option-draggable]")!;
    const firstBlock = first.closest("[data-option-draggable]")!;
    fireEvent.dragStart(secondBlock, { dataTransfer: transfer });
    expect(secondBlock).toHaveClass("ring-2");
    fireEvent.drop(firstBlock, { dataTransfer: transfer });
    expect(screen.getByLabelText("Question 1 option 1")).toHaveValue("Second");
    expect(screen.getByLabelText("Question 1 option 2")).toHaveValue("First");
    expect(
      screen.queryByRole("button", { name: /Move question 1 option/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Drag question 1 option/ }),
    ).not.toBeInTheDocument();
    expect(firstBlock).toHaveAttribute("draggable", "true");
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
    const transfer = dataTransfer();
    fireEvent.dragStart(
      screen
        .getByLabelText("Question 1 option 1")
        .closest("[data-option-draggable]")!,
      { dataTransfer: transfer },
    );
    fireEvent.drop(
      screen
        .getByLabelText("Question 2 option 1")
        .closest("[data-option-index]")!,
      { dataTransfer: transfer },
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
    const transfer = dataTransfer();
    fireEvent.dragStart(
      screen
        .getByLabelText("Question 1 option 2")
        .closest("[data-option-draggable]")!,
      { dataTransfer: transfer },
    );
    fireEvent.drop(
      screen
        .getByLabelText("Question 1 option 1")
        .closest("[data-option-draggable]")!,
      { dataTransfer: transfer },
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

  it("reorders question cards without letting nested option dragging reorder questions", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const prompts = screen.getAllByLabelText("Question text");
    fireEvent.change(prompts[0]!, { target: { value: "First question" } });
    fireEvent.change(prompts[1]!, { target: { value: "Second question" } });
    const questions = screen.getAllByRole("group", { name: /Question \d/ });
    const questionTransfer = dataTransfer();
    fireEvent.dragStart(questions[1]!, { dataTransfer: questionTransfer });
    expect(questions[1]).toHaveClass("ring-2");
    fireEvent.drop(questions[0]!, { dataTransfer: questionTransfer });
    expect(screen.getAllByLabelText("Question text")[0]).toHaveValue(
      "Second question",
    );

    const optionTransfer = dataTransfer();
    const optionBlock = screen
      .getByLabelText("Question 1 option 1")
      .closest("[data-option-draggable]")!;
    fireEvent.dragStart(optionBlock, { dataTransfer: optionTransfer });
    fireEvent.drop(screen.getAllByRole("group", { name: /Question \d/ })[1]!, {
      dataTransfer: optionTransfer,
    });
    expect(screen.getAllByLabelText("Question text")[0]).toHaveValue(
      "Second question",
    );
    expect(
      screen.queryByRole("button", { name: /Move (up|down)/ }),
    ).not.toBeInTheDocument();
  });

  it("persists question order and renders the saved order after reload", async () => {
    const orderedDraft: SurveyDetail = {
      ...draft,
      questionCount: 2,
      questions: [
        {
          id: "first",
          position: 1,
          prompt: "First question",
          type: "FREE_TEXT",
          required: false,
          options: [],
        },
        {
          id: "second",
          position: 2,
          prompt: "Second question",
          type: "FREE_TEXT",
          required: false,
          options: [],
        },
      ],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    const { unmount } = render(<SurveyBuilder survey={orderedDraft} />);
    const questionTransfer = dataTransfer();
    const cards = screen.getAllByRole("group", { name: /Question \d/ });
    fireEvent.dragStart(cards[1]!, { dataTransfer: questionTransfer });
    fireEvent.drop(cards[0]!, { dataTransfer: questionTransfer });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const saved = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(
      saved.questions.map((question: { prompt: string }) => question.prompt),
    ).toEqual(["Second question", "First question"]);
    unmount();
    render(
      <SurveyBuilder
        survey={{
          ...orderedDraft,
          questions: orderedDraft.questions.map((question, index) => ({
            ...question,
            prompt: saved.questions[index].prompt,
          })),
        }}
      />,
    );
    expect(screen.getAllByLabelText("Question text")[0]).toHaveValue(
      "Second question",
    );
    fetchMock.mockRestore();
  });

  it("does not initiate card dragging from interactive question or option controls", () => {
    render(<SurveyBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const questionTransfer = dataTransfer();
    fireEvent.dragStart(screen.getByLabelText("Question text"), {
      dataTransfer: questionTransfer,
    });
    expect(questionTransfer.types).toEqual([]);

    const optionTransfer = dataTransfer();
    fireEvent.dragStart(screen.getByLabelText("Question 1 option 1"), {
      dataTransfer: optionTransfer,
    });
    expect(optionTransfer.types).toEqual([]);
    fireEvent.change(screen.getByLabelText("Question 1 option 1"), {
      target: { value: "Editable answer" },
    });
    expect(screen.getByLabelText("Question 1 option 1")).toHaveValue(
      "Editable answer",
    );
  });

  it("shows respondent-visibility placeholders only while authoring fields are empty", () => {
    render(<SurveyBuilder />);
    const title = screen.getByLabelText("Survey title");
    const description = screen.getByLabelText(/Description/);
    expect(title).toHaveAttribute(
      "placeholder",
      "Survey title — visible to respondents",
    );
    expect(description).toHaveAttribute(
      "placeholder",
      "Survey description — visible to respondents",
    );
    expect(title).toHaveValue("");
    expect(description).toHaveValue("");
    fireEvent.change(title, { target: { value: "Actual title" } });
    fireEvent.change(description, { target: { value: "Actual description" } });
    expect(title).toHaveValue("Actual title");
    expect(description).toHaveValue("Actual description");
  });

  it("persists unsaved valid editor state before activation without a manual save", async () => {
    const existing = {
      ...draft,
      title: "Existing",
      questionCount: 1,
      questions: [
        {
          id: "question-1",
          position: 1,
          prompt: "Old prompt",
          type: "SINGLE_CHOICE" as const,
          required: false,
          options: ["Yes", "No"],
        },
      ],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    render(<SurveyBuilder survey={existing} />);
    fireEvent.change(screen.getByLabelText("Question text"), {
      target: { value: "Current unsaved prompt" },
    });
    const activate = screen.getByRole("button", { name: "Activate" });
    expect(activate).toBeEnabled();
    fireEvent.click(activate);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/surveys/survey");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject(
      {
        questions: [{ prompt: "Current unsaved prompt" }],
      },
    );
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/surveys/survey/actions");
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      action: "transition",
      target: "ACTIVE",
      stateVersion: 1,
    });
    fetchMock.mockRestore();
  });

  it("creates and activates a valid new survey in one flow", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "created" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    render(<SurveyBuilder />);
    fireEvent.change(screen.getByLabelText("Survey title"), {
      target: { value: "Ready" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question text"), {
      target: { value: "Question" },
    });
    fireEvent.change(screen.getByLabelText("Question 1 option 1"), {
      target: { value: "Yes" },
    });
    fireEvent.change(screen.getByLabelText("Question 1 option 2"), {
      target: { value: "No" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/surveys");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/surveys/created/actions");
    fetchMock.mockRestore();
  });

  it("keeps activation disabled until the current editor state is valid", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<SurveyBuilder />);
    const activate = screen.getByRole("button", { name: "Activate" });
    expect(activate).toBeDisabled();
    fireEvent.click(activate);
    expect(fetchMock).not.toHaveBeenCalled();
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
