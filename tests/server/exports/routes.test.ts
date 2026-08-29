import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors/app-error";

const create = vi.fn();
const getCurrentEmployee = vi.fn();
vi.mock("@/server/modules/exports/runtime", () => ({
  getExportService: () => ({ create }),
}));
vi.mock("@/server/modules/auth/current-employee", () => ({
  getCurrentEmployee,
}));

describe("Phase 11 export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentEmployee.mockResolvedValue({ role: "RESEARCHER" });
  });

  it("returns a hardened authenticated XLSX attachment with source labels", async () => {
    create.mockResolvedValue({
      stream: Readable.from([Buffer.from("xlsx")]),
      filename: "safe.xlsx",
      exportedAt: "2026-08-29T12:00:00.000Z",
      sourceAt: "2026-08-29T11:59:00.000Z",
      part: 1,
      totalParts: 3,
      rowCount: 10,
    });
    const { GET } =
      await import("@/app/api/surveys/[surveyId]/exports/[kind]/route");
    const response = await GET(
      new NextRequest(
        "https://survey.example.com/api/surveys/survey/exports/current?part=1",
      ),
      {
        params: Promise.resolve({ surveyId: "survey", kind: "current" }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="safe.xlsx"',
    );
    expect(response.headers.get("x-export-total-parts")).toBe("3");
    expect(await response.text()).toBe("xlsx");
  });

  it("returns a generic hardened Product Manager denial", async () => {
    create.mockRejectedValue(
      new AppError({
        category: "AUTHORIZATION",
        code: "FORBIDDEN",
        message: "Synthetic Person +12025550123",
        safeMessage: "Access is denied.",
        status: 403,
      }),
    );
    const { GET } =
      await import("@/app/api/surveys/[surveyId]/exports/[kind]/route");
    const response = await GET(
      new NextRequest(
        "https://survey.example.com/api/surveys/survey/exports/current",
      ),
      {
        params: Promise.resolve({ surveyId: "survey", kind: "current" }),
      },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe('{"message":"Access is denied."}');
  });

  it.each([
    "name=Synthetic%20Person",
    "phone=%2B12025550123",
    "referenceId=R-7K3M9W2X8Q4D",
  ])(
    "rejects prohibited or unsupported export URL input: %s",
    async (query) => {
      const { GET } =
        await import("@/app/api/surveys/[surveyId]/exports/[kind]/route");
      const response = await GET(
        new NextRequest(
          `https://survey.example.com/api/surveys/survey/exports/current?${query}`,
        ),
        {
          params: Promise.resolve({ surveyId: "survey", kind: "current" }),
        },
      );
      expect(response.status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
});
