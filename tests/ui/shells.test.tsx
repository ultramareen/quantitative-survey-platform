// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InternalShell } from "@/components/layout/internal-shell";
import { PublicShell } from "@/components/layout/public-shell";
import { FormField } from "@/components/ui/form-field";
import { LoadingState } from "@/components/ui/loading-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => currentPath,
}));

let currentPath = "/app";

const employee = {
  id: "employee-1",
  email: "admin@synthetic.invalid",
  displayName: "Synthetic Admin",
  role: "ADMIN" as const,
  authorizationVersion: 1,
};

describe("responsive and accessible foundation primitives", () => {
  it("renders a public landmark and accessible home link", () => {
    render(
      <PublicShell>
        <h1>Public content</h1>
      </PublicShell>,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(
      screen.getByRole("link", { name: "Quantitative Survey Platform" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders semantic internal navigation with responsive layout classes", () => {
    currentPath = "/app";
    const { container } = render(
      <InternalShell employee={employee}>
        <h1>Internal content</h1>
      </InternalShell>,
    );

    expect(
      screen.getByRole("navigation", {
        name: "Internal foundation navigation",
      }),
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("lg:grid");
    expect(screen.getByRole("navigation")).toHaveClass("flex-wrap");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Respondents" })).toHaveAttribute(
      "href",
      "/app/respondents",
    );
  });

  it("derives the active navigation section from nested routes", () => {
    currentPath = "/app/surveys/survey-1";
    render(
      <InternalShell employee={employee}>
        <h1>Survey</h1>
      </InternalShell>,
    );
    expect(screen.getByRole("link", { name: "Surveys" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Workspace" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not render respondent navigation for Product Managers", () => {
    render(
      <InternalShell employee={{ ...employee, role: "PRODUCT_MANAGER" }}>
        <h1>Internal content</h1>
      </InternalShell>,
    );
    expect(
      screen.queryByRole("link", { name: "Respondents" }),
    ).not.toBeInTheDocument();
  });

  it("connects form labels and errors accessibly", () => {
    render(
      <FormField
        error="Synthetic validation error"
        id="example"
        label="Example field"
      />,
    );

    expect(screen.getByLabelText("Example field")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Synthetic validation error",
    );
  });

  it("announces loading state", () => {
    render(<LoadingState label="Loading synthetic content" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading synthetic content",
    );
  });
});
