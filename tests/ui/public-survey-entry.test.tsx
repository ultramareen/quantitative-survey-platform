// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicSurveyEntry } from "@/components/respondents/public-survey-entry";
import type { PublicAttemptState } from "@/types/public-survey";

vi.mock("@/components/respondents/pending-mutations", () => ({
  acknowledgePending: vi.fn(),
  pendingFor: vi.fn().mockResolvedValue([]),
  purgePending: vi.fn(),
  retainPending: vi.fn(),
}));

const attempt: PublicAttemptState = {
  title: "Public study",
  description: "Description",
  generation: 1,
  revision: 1,
  answers: { "1": 1, "2": [1] },
  editable: true,
  recorded: false,
  questions: [
    {
      position: 1,
      prompt: "Single choice",
      required: true,
      type: "SINGLE_CHOICE",
      options: [{ position: 1, label: "Single-line answer" }],
    },
    {
      position: 2,
      prompt: "Multiple choice",
      required: false,
      type: "MULTIPLE_CHOICE",
      options: [
        {
          position: 1,
          label:
            "A longer answer label that can wrap naturally onto another line",
        },
      ],
    },
  ],
};

function mockQuestionnaire(submitResponse: Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith("/open"))
      return Promise.resolve(
        new Response(
          JSON.stringify({ availability: "ACTIVE", identified: true }),
          { status: 200 },
        ),
      );
    if (init?.method === "POST") return Promise.resolve(submitResponse);
    return Promise.resolve(
      new Response(JSON.stringify(attempt), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

describe("public survey questionnaire UI", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows only the required minimal message after successful persistence", async () => {
    mockQuestionnaire(
      new Response(JSON.stringify({ submitted: true }), { status: 200 }),
    );
    render(<PublicSurveyEntry publicId="public" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit response" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Thank you. Your response has been recorded."),
      ).toBeInTheDocument(),
    );
    const completion = screen.getByText(
      "Thank you. Your response has been recorded.",
    ).parentElement!;
    expect(completion).toHaveTextContent(
      /^Thank you\. Your response has been recorded\.$/,
    );
    expect(screen.queryByText(/edit window/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit response" }),
    ).not.toBeInTheDocument();
  });

  it("does not show success when response persistence fails", async () => {
    mockQuestionnaire(
      new Response(JSON.stringify({ message: "Submission failed." }), {
        status: 500,
      }),
    );
    render(<PublicSurveyEntry publicId="public" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit response" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Submission failed.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Thank you. Your response has been recorded."),
    ).not.toBeInTheDocument();
  });

  it.each([375, 1280])(
    "aligns radio and checkbox controls naturally at a %ipx viewport",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      mockQuestionnaire(
        new Response(JSON.stringify({ submitted: true }), { status: 200 }),
      );
      render(<PublicSurveyEntry publicId="public" />);
      const singleLabel = await screen.findByText("Single-line answer");
      const multiLabel = screen.getByText(/A longer answer label/);
      for (const labelText of [singleLabel, multiLabel]) {
        const label = labelText.closest("label")!;
        const control = within(label).getByRole(
          labelText === singleLabel ? "radio" : "checkbox",
        );
        expect(label).toHaveClass("items-start");
        expect(control).toHaveClass("mt-1", "shrink-0");
      }
    },
  );
});
