import { describe, expect, it } from "vitest";
import {
  pruneUnreachableAnswers,
  reachableQuestions,
} from "@/server/modules/attempts/branching";
import type { PublicQuestion } from "@/types/public-survey";

const destination = (
  type: "NEXT" | "END" | "QUESTION",
  questionId?: string,
) => ({ type, questionId });
const questions: PublicQuestion[] = [
  {
    id: "q1",
    position: 1,
    prompt: "Route",
    type: "SINGLE_CHOICE",
    required: true,
    options: [
      { position: 1, label: "Next", destination: destination("NEXT") },
      {
        position: 2,
        label: "Skip",
        destination: destination("QUESTION", "q3"),
      },
      { position: 3, label: "Finish", destination: destination("END") },
    ],
  },
  {
    id: "q2",
    position: 2,
    prompt: "Skipped",
    type: "FREE_TEXT",
    required: true,
    options: [],
  },
  {
    id: "q3",
    position: 3,
    prompt: "Later",
    type: "FREE_TEXT",
    required: true,
    options: [],
  },
];

describe("reachable survey paths", () => {
  it("stops at an unanswered branching question", () => {
    expect(reachableQuestions(questions, {}).map((q) => q.id)).toEqual(["q1"]);
  });
  it("uses default next-question flow", () => {
    expect(reachableQuestions(questions, { "1": 1 }).map((q) => q.id)).toEqual([
      "q1",
      "q2",
      "q3",
    ]);
  });
  it("uses a forward branch", () => {
    expect(reachableQuestions(questions, { "1": 2 }).map((q) => q.id)).toEqual([
      "q1",
      "q3",
    ]);
  });
  it("supports End survey", () => {
    expect(reachableQuestions(questions, { "1": 3 }).map((q) => q.id)).toEqual([
      "q1",
    ]);
  });
  it("removes stale answers from the previous branch and its completion denominator", () => {
    const answers = pruneUnreachableAnswers(questions, {
      "1": 2,
      "2": "stale",
      "3": "kept",
    });
    expect(answers).toEqual({ "1": 2, "3": "kept" });
    expect(Object.keys(answers)).toHaveLength(
      reachableQuestions(questions, answers).length,
    );
  });
});
