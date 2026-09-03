// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmployeeManagement } from "@/components/admin/employee-management";
import type { EmployeeManagementRow } from "@/types/employee-management";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => vi.restoreAllMocks());

const pending: EmployeeManagementRow = {
  invitationId: "invitation",
  userId: null,
  email: "pending@synthetic.invalid",
  displayName: null,
  role: "PRODUCT_MANAGER",
  status: "INVITED",
  invitedAt: new Date("2026-09-01T12:00:00Z"),
  tokenExpiresAt: new Date("2026-09-04T12:00:00Z"),
  disabledAt: null,
};

describe("employee lifecycle management UI", () => {
  it("requires confirmation before cancelling an invitation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EmployeeManagement rows={[pending]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel invitation" }));
    expect(fetchMock).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel invitation" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      action: "cancel",
    });
  });

  it("changes a non-Admin role directly from the selector", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const confirm = vi.spyOn(window, "confirm");
    render(<EmployeeManagement rows={[pending]} />);
    fireEvent.change(screen.getByLabelText(`Role for ${pending.email}`), {
      target: { value: "RESEARCHER" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(confirm).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Change role" }),
    ).not.toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      action: "change-role",
      role: "RESEARCHER",
    });
  });

  it("requires an explicit confirmation before assigning Admin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EmployeeManagement rows={[pending]} />);
    fireEvent.change(screen.getByLabelText(`Role for ${pending.email}`), {
      target: { value: "ADMIN" },
    });
    expect(confirm).toHaveBeenCalledWith(
      "Вы хотите назначить роль «Администратор». Вы уверены?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(`Role for ${pending.email}`)).toHaveValue(
      "PRODUCT_MANAGER",
    );

    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText(`Role for ${pending.email}`), {
      target: { value: "ADMIN" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      action: "change-role",
      role: "ADMIN",
    });
  });

  it("labels cancelled invitations and deactivated employees distinctly", () => {
    render(
      <EmployeeManagement
        rows={[
          { ...pending, status: "DISABLED", disabledAt: new Date() },
          {
            ...pending,
            invitationId: null,
            userId: "user",
            displayName: "Former Employee",
            status: "ACTIVE",
            disabledAt: new Date(),
          },
        ]}
      />,
    );
    expect(screen.getByText("Cancelled invitation")).toBeInTheDocument();
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
  });
});
