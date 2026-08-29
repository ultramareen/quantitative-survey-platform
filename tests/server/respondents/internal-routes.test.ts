import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors/app-error";

const list = vi.fn();
const detail = vi.fn();
const getCurrentEmployee = vi.fn();
vi.mock("@/server/modules/respondents/internal-runtime", () => ({
  getInternalRespondentService: () => ({ list, detail }),
}));
vi.mock("@/server/modules/auth/current-employee", () => ({
  getCurrentEmployee,
}));

describe("internal respondent PII routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentEmployee.mockResolvedValue({ role: "RESEARCHER" });
  });

  it("passes only approved non-PII query filters and disables caching", async () => {
    list.mockResolvedValue({
      respondents: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
    const { GET } = await import("@/app/api/respondents/route");
    const response = await GET(
      new NextRequest(
        "https://survey.example.com/api/respondents?referenceId=R-7K3M9W2X8Q4D&surveyId=00000000-0000-4000-8000-000000000002",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(list).toHaveBeenCalledWith(expect.anything(), {
      referenceId: "R-7K3M9W2X8Q4D",
      surveyId: "00000000-0000-4000-8000-000000000002",
      page: undefined,
      pageSize: undefined,
    });
  });

  it("returns a generic private 403 without leaking PII", async () => {
    list.mockRejectedValue(
      new AppError({
        category: "AUTHORIZATION",
        code: "FORBIDDEN",
        message: "Synthetic Person +12025550123",
        safeMessage: "Access is denied.",
        status: 403,
      }),
    );
    const { GET } = await import("@/app/api/respondents/route");
    const response = await GET(
      new NextRequest("https://survey.example.com/api/respondents"),
    );
    const body = await response.text();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toBe('{"message":"Access is denied."}');
    expect(body).not.toContain("Synthetic Person");
    expect(body).not.toContain("+12025550123");
  });

  it.each(["disabled", "stale-role"])(
    "rejects a %s session that current-session validation has invalidated",
    async () => {
      getCurrentEmployee.mockResolvedValue(null);
      list.mockImplementation((principal) => {
        if (!principal)
          throw new AppError({
            category: "AUTHENTICATION",
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication is required.",
            safeMessage: "Authentication is required.",
            status: 401,
          });
      });
      const { GET } = await import("@/app/api/respondents/route");
      const response = await GET(
        new NextRequest("https://survey.example.com/api/respondents"),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it("serves exact reference detail with no-store", async () => {
    detail.mockResolvedValue({ referenceId: "R-7K3M9W2X8Q4D" });
    const { GET } = await import("@/app/api/respondents/[referenceId]/route");
    const response = await GET(new Request("https://survey.example.com"), {
      params: Promise.resolve({ referenceId: "R-7K3M9W2X8Q4D" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(detail).toHaveBeenCalledWith(expect.anything(), "R-7K3M9W2X8Q4D");
  });

  it.each(["name=Synthetic%20Person", "phone=%2B12025550123"])(
    "rejects PII URL filters before the service: %s",
    async (query) => {
      const { GET } = await import("@/app/api/respondents/route");
      const response = await GET(
        new NextRequest(`https://survey.example.com/api/respondents?${query}`),
      );
      expect(response.status).toBe(400);
      expect(list).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({
        message: "The respondent query is invalid.",
      });
    },
  );
});
