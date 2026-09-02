// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PauseAllSurveys,
  SurveyManagementActions,
} from "@/components/surveys/pause-all-surveys";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => vi.restoreAllMocks());
beforeEach(() => refresh.mockClear());

describe("Pause all active surveys", () => {
  it("renders only for Admin", () => {
    const { rerender } = render(
      <SurveyManagementActions role="PRODUCT_MANAGER" />,
    );
    expect(
      screen.queryByRole("button", { name: "Pause all active surveys" }),
    ).not.toBeInTheDocument();
    rerender(<SurveyManagementActions role="ADMIN" />);
    expect(
      screen.getByRole("button", { name: "Pause all active surveys" }),
    ).toBeInTheDocument();
  });

  it("confirms before calling the atomic action and refreshes with a toast", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ affected: 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<PauseAllSurveys />);
    fireEvent.click(
      screen.getByRole("button", { name: "Pause all active surveys" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Respondents will no longer",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause all" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "All active surveys have been paused.",
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows failure without success or refresh", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Synthetic failure" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<PauseAllSurveys />);
    fireEvent.click(
      screen.getByRole("button", { name: "Pause all active surveys" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause all" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Synthetic failure",
    );
    expect(
      screen.queryByText("All active surveys have been paused."),
    ).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
