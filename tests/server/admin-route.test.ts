import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
const list = vi.fn();
const getCurrentEmployee = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/modules/auth/current-employee", () => ({
  getCurrentEmployee,
}));
vi.mock("@/server/modules/employees/runtime", () => ({
  getEmployeeManagementService: () => ({ list }),
}));

describe("Administration routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects the direct Administration URL to employee management", async () => {
    const { default: AdministrationPage } =
      await import("@/app/(internal)/app/admin/page");
    AdministrationPage();
    expect(redirect).toHaveBeenCalledWith("/app/admin/employees");
  });

  it("renders existing employee management through its authorized service", async () => {
    const actor = { id: "admin", role: "ADMIN" };
    getCurrentEmployee.mockResolvedValue(actor);
    list.mockResolvedValue([]);
    const { default: EmployeesPage } =
      await import("@/app/(internal)/app/admin/employees/page");

    const page = await EmployeesPage();

    expect(list).toHaveBeenCalledWith(actor);
    expect(page.props.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            children: "Employees and invitations",
          }),
        }),
      ]),
    );
  });

  it("retains server-side authorization failure handling", async () => {
    getCurrentEmployee.mockResolvedValue(null);
    list.mockRejectedValue(new Error("forbidden"));
    const { default: EmployeesPage } =
      await import("@/app/(internal)/app/admin/employees/page");

    await EmployeesPage();

    expect(redirect).toHaveBeenCalledWith("/app?error=forbidden");
  });
});
