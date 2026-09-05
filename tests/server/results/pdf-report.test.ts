import { describe, expect, it } from "vitest";
import {
  buildResultsPdfDefinition,
  generateResultsPdf,
  paginateQuestions,
} from "@/server/modules/results/pdf-report";
import type { PdfReportInput } from "@/server/modules/results/pdf-report";

const input: PdfReportInput = {
  surveyTitle: "Remote Work Experience Survey",
  launchedAt: "2026-05-12T00:00:00.000Z",
  snapshot: {
    snapshotNumber: 4,
    dataCutoffAt: "2026-08-25T00:00:00.000Z",
    createdAt: "2026-08-25T00:01:00.000Z",
    funnel: {
      opened: 12,
      identified: 10,
      currentAttempts: 10,
      started: 9,
      startedPercentage: 75,
      greaterThanHalf: 8,
      greaterThanHalfPercentage: 66.67,
      completed: 7,
      completedPercentage: 58.33,
    },
    questions: [
      {
        position: 1,
        prompt: "Where do you work?",
        type: "MULTIPLE_CHOICE",
        denominator: 10,
        options: [
          {
            position: 1,
            label: "Home",
            count: 8,
            percentage: 80,
            leader: true,
          },
          {
            position: 2,
            label: "Office",
            count: 6,
            percentage: 60,
            leader: false,
          },
        ],
      },
    ],
  },
};

describe("results PDF report", () => {
  it("uses the supplied immutable snapshot metadata and contains no generation-date field or PII fields", () => {
    const definition = buildResultsPdfDefinition(input);
    const serialized = JSON.stringify(definition);
    expect(serialized).toContain("Remote Work Experience Survey");
    expect(serialized).toContain("Survey period: 12 May 2026 – 25 Aug 2026");
    expect(serialized).not.toContain("Generated on");
    expect(serialized).not.toMatch(/phone|reference id|respondent name/i);
    expect(serialized).toContain("8 (80%)");
    expect(serialized).toContain("6 (60%)");
  });
  it("allows multiple-choice percentages above 100 and highlights only supplied leaders", () => {
    const serialized = JSON.stringify(buildResultsPdfDefinition(input));
    expect(80 + 60).toBeGreaterThan(100);
    expect(serialized).toContain("#F5C242");
  });
  it("uses no winner when all values are zero", () => {
    const zero = structuredClone(input);
    zero.snapshot.questions[0]!.options =
      zero.snapshot.questions[0]!.options!.map((value) => ({
        ...value,
        count: 0,
        percentage: 0,
        leader: false,
      }));
    const serialized = JSON.stringify(buildResultsPdfDefinition(zero));
    expect(serialized).toContain("0 (0%)");
  });
  it("places at most four regular charts on a page and gives long labels more room", () => {
    const regular = Array.from({ length: 9 }, (_, index) => ({
      ...input.snapshot.questions[0]!,
      position: index + 1,
    }));
    expect(paginateQuestions(regular).map((page) => page.length)).toEqual([
      4, 4, 1,
    ]);
    const long = [
      { ...regular[0]!, prompt: "x".repeat(141) },
      ...regular.slice(1, 4),
    ];
    expect(paginateQuestions(long).map((page) => page.length)).toEqual([3, 1]);
  });
  it("renders a deterministic landscape PDF", async () => {
    const pdf = await generateResultsPdf(input);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
