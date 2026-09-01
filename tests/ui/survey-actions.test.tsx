// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicSurveyUrl } from "@/components/surveys/public-survey-url";
import { SurveyActions } from "@/components/surveys/survey-actions";
import type { SurveyDetail } from "@/types/survey";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const survey: SurveyDetail = {
  id: "survey",
  publicId: "public-token",
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
const employee = {
  id: "owner",
  email: "owner@synthetic.invalid",
  displayName: "Owner",
  role: "PRODUCT_MANAGER" as const,
  authorizationVersion: 1,
};

describe("survey actions UI", () => {
  it("locks duplicate submission immediately and navigates to the copy", async () => {
    let resolveResponse!: (value: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(new Promise((resolve) => (resolveResponse = resolve)));
    render(<SurveyActions survey={survey} employee={employee} />);
    const duplicate = screen.getByRole("button", {
      name: "Duplicate as Draft",
    });
    fireEvent.click(duplicate);
    expect(screen.getByRole("button", { name: "Duplicating…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Duplicating survey…");
    fireEvent.click(screen.getByRole("button", { name: "Duplicating…" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(
      new Response(JSON.stringify({ id: "copy" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/surveys/copy"));
    fetchMock.mockRestore();
  });

  it("renders activation only in the footer placement", () => {
    const { rerender } = render(
      <SurveyActions survey={survey} employee={employee} />,
    );
    expect(
      screen.queryByRole("button", { name: "Activate" }),
    ).not.toBeInTheDocument();
    rerender(
      <SurveyActions survey={survey} employee={employee} placement="footer" />,
    );
    expect(screen.getByRole("button", { name: "Activate" })).toHaveClass(
      "bg-emerald-700",
    );
  });

  it("shows a visible duplicate error and releases the lock", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("synthetic network failure"));
    render(<SurveyActions survey={survey} employee={employee} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate as Draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be completed",
    );
    expect(
      screen.getByRole("button", { name: "Duplicate as Draft" }),
    ).toBeEnabled();
    fetchMock.mockRestore();
  });

  it("shows and copies the complete absolute public URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const url = "https://survey.example.com/survey/public-token";
    render(<PublicSurveyUrl url={url} />);
    expect(screen.getByRole("link", { name: url })).toHaveAttribute(
      "href",
      url,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy public survey URL" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(
      screen.getByRole("button", { name: "Copy public survey URL" }),
    ).toHaveTextContent("Copied");
  });
});
