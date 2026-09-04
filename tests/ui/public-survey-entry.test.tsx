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

function mockIdentification() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).endsWith("/open"))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            availability: "ACTIVE",
            identified: false,
            title: "Public study",
          }),
          { status: 200 },
        ),
      );
    if (init?.method === "POST")
      return Promise.resolve(
        new Response(JSON.stringify({ identified: true }), { status: 200 }),
      );
    if (String(input).endsWith("/attempt"))
      return Promise.resolve(
        new Response(JSON.stringify(attempt), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    throw new Error(`Unexpected request: ${String(input)}`);
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
        expect(control).toHaveClass(
          "respondent-choice-control",
          "mt-1",
          "shrink-0",
        );
      }
    },
  );

  it("uses an in-card question heading instead of a border-cutting legend", async () => {
    mockQuestionnaire(
      new Response(JSON.stringify({ submitted: true }), { status: 200 }),
    );
    const { container } = render(<PublicSurveyEntry publicId="public" />);

    await screen.findByText("1. Single choice");
    const group = container.querySelector(
      'fieldset[aria-labelledby="question-1-heading"]',
    )!;
    expect(group).toHaveAttribute("role", "group");
    expect(group.querySelector("legend")).toBeNull();
    expect(
      group.querySelector(".respondent-question-heading"),
    ).toHaveTextContent("1. Single choiceRequired");
    expect(screen.getByText("Optional")).toHaveClass(
      "text-sm",
      "font-normal",
      "text-slate-500",
    );
    expect(container.querySelectorAll("legend")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Submit response" })).toHaveClass(
      "bg-blue-700",
    );
  });
});

describe("public survey phone validation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(["+7968234", "+7968234123432"])(
    "rejects incomplete or overlong +7 input before submission: %s",
    async (phone) => {
      const fetchMock = mockIdentification();
      render(<PublicSurveyEntry publicId="public" />);
      fireEvent.change(await screen.findByLabelText("Your name"), {
        target: { value: "Person" },
      });
      fireEvent.change(screen.getByLabelText("Phone number"), {
        target: { value: phone },
      });
      fireEvent.click(screen.getByRole("button", { name: "Begin survey" }));
      expect(
        await screen.findByText("Enter a valid and complete phone number."),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(screen.getByLabelText("Phone number")).toHaveValue(phone);
    },
  );

  it.each([
    ["+79682341234", "RU"],
    ["+442079460123", "GB"],
  ])(
    "submits a valid supported international phone: %s",
    async (phone, country) => {
      const fetchMock = mockIdentification();
      render(<PublicSurveyEntry publicId="public" />);
      fireEvent.change(await screen.findByLabelText("Your name"), {
        target: { value: "Person" },
      });
      fireEvent.change(screen.getByLabelText("Phone country"), {
        target: { value: country },
      });
      fireEvent.change(screen.getByLabelText("Phone number"), {
        target: { value: phone },
      });
      fireEvent.click(screen.getByRole("button", { name: "Begin survey" }));
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some((call) => call[1]?.method === "POST"),
        ).toBe(true),
      );
      const submission = fetchMock.mock.calls.find(
        (call) => call[1]?.method === "POST",
      )!;
      expect(JSON.parse(String(submission[1]!.body))).toMatchObject({
        phone,
        country,
      });
    },
  );
});
