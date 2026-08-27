// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InternalShell } from "@/components/layout/internal-shell";
import { PublicShell } from "@/components/layout/public-shell";
import { FormField } from "@/components/ui/form-field";
import { LoadingState } from "@/components/ui/loading-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

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
      screen.getByRole("link", { name: "Quantitative Survey Platform" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders semantic internal navigation with responsive layout classes", () => {
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
    expect(screen.getByRole("main")).toBeInTheDocument();
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
