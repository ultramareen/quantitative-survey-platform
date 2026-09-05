import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const report = vi.fn();
const generateResultsPdf = vi.fn();

vi.mock("@/server/modules/auth/current-employee", () => ({
  getCurrentEmployee: vi.fn().mockResolvedValue({ id: "employee" }),
}));
vi.mock("@/server/modules/results/runtime", () => ({
  getResultsService: () => ({ report }),
}));
vi.mock("@/server/modules/results/pdf-report", () => ({ generateResultsPdf }));

describe("results PDF route", () => {
  beforeEach(() => {
    report.mockReset().mockResolvedValue({ snapshot: { snapshotNumber: 3 } });
    generateResultsPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-test"));
  });

  it("renders the requested immutable snapshot without invoking calculation", async () => {
    const { GET } =
      await import("@/app/api/surveys/[surveyId]/results/pdf/route");
    const response = await GET(
      new NextRequest(
        "http://local/api/surveys/survey/results/pdf?snapshotNumber=3",
      ),
      { params: Promise.resolve({ surveyId: "survey" }) },
    );
    expect(report).toHaveBeenCalledWith(expect.anything(), "survey", 3);
    expect(generateResultsPdf).toHaveBeenCalledWith({
      snapshot: { snapshotNumber: 3 },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
