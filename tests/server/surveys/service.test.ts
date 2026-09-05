import { describe, expect, it } from "vitest";
import type { SurveyRepository } from "@/server/modules/surveys/repository";
import { duplicateQuestionnaire } from "@/server/modules/surveys/repository";
import {
  normalizeDraft,
  SurveyService,
  validateActivation,
} from "@/server/modules/surveys/service";
import type { EmployeePrincipal } from "@/types/employee";
import type { SurveyDetail, SurveyDraftInput } from "@/types/survey";

const owner: EmployeePrincipal = {
  id: "owner",
  email: "owner@example.com",
  displayName: "Owner",
  role: "PRODUCT_MANAGER",
  authorizationVersion: 1,
};
const other = { ...owner, id: "other" };
const researcher = { ...owner, id: "researcher", role: "RESEARCHER" as const };
const admin = { ...owner, id: "admin", role: "ADMIN" as const };
const adminOwner = { ...admin, id: "owner" };
const option = (id: string, label: string) => ({
  id,
  label,
  destination: { type: "NEXT" as const },
});
const valid: SurveyDraftInput = {
  title: "Study",
  description: "Description",
  questions: [
    {
      id: "q1",
      prompt: "Choose",
      type: "SINGLE_CHOICE",
      required: true,
      options: [option("o1", "A"), option("o2", "B")],
    },
    {
      id: "q2",
      prompt: "Explain",
      type: "FREE_TEXT",
      required: false,
      options: [],
    },
  ],
};
const detail: SurveyDetail = {
  id: "survey",
  publicId: "public",
  ownerId: "owner",
  ownerName: "Owner",
  title: "Study",
  description: null,
  status: "DRAFT",
  pauseReason: null,
  stateVersion: 1,
  questionCount: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  launchedAt: null,
  pausedAt: null,
  completedAt: null,
  questions: valid.questions.map((q, i) => ({
    ...q,
    id: `q${i}`,
    position: i + 1,
  })),
};
class Repo implements SurveyRepository {
  survey: SurveyDetail | null = detail;
  created?: SurveyDraftInput;
  updated?: SurveyDraftInput;
  transitioned?: Parameters<SurveyRepository["transition"]>[0];
  async list() {
    return this.survey ? [this.survey] : [];
  }
  async find() {
    return this.survey;
  }
  async create(_: string, input: SurveyDraftInput) {
    this.created = input;
    return { id: "created" };
  }
  async update(_: string, __: string, input: SurveyDraftInput) {
    this.updated = input;
  }
  async duplicate() {
    return { id: "copy" };
  }
  async transition(input: Parameters<SurveyRepository["transition"]>[0]) {
    this.transitioned = input;
  }
  async remove() {
    return { tombstoned: true };
  }
}

describe("survey builder validation", () => {
  it("normalizes valid mixed questions and preserves ordering and required state", () => {
    expect(normalizeDraft(valid)).toEqual(valid);
  });
  it("accepts 50 questions and rejects 51", () => {
    const question = valid.questions[1]!;
    expect(
      normalizeDraft({
        ...valid,
        questions: Array.from({ length: 50 }, (_, index) => ({
          ...question,
          id: `free-${index}`,
        })),
      }).questions,
    ).toHaveLength(50);
    expect(() =>
      normalizeDraft({
        ...valid,
        questions: Array.from({ length: 51 }, (_, index) => ({
          ...question,
          id: `free-${index}`,
        })),
      }),
    ).toThrow("at most 50");
  });
  it("accepts 11 options and rejects 12", () => {
    const choice = {
      ...valid.questions[0]!,
      options: Array.from({ length: 11 }, (_, index) =>
        option(`many-${index}`, "Option"),
      ),
    };
    expect(
      normalizeDraft({ ...valid, questions: [choice] }).questions[0]?.options,
    ).toHaveLength(11);
    expect(() =>
      normalizeDraft({
        ...valid,
        questions: [
          {
            ...choice,
            options: Array.from({ length: 12 }, (_, index) =>
              option(`too-many-${index}`, "Option"),
            ),
          },
        ],
      }),
    ).toThrow("at most 11");
  });
  it("rejects malformed prompts, options, and incompatible free-text options", () => {
    expect(() => normalizeDraft({ ...valid, title: " " })).toThrow("title");
    expect(() =>
      normalizeDraft({
        ...valid,
        questions: [
          { ...valid.questions[1]!, options: [option("bad-free", "No")] },
        ],
      }),
    ).toThrow("cannot have");
    expect(() =>
      normalizeDraft({
        ...valid,
        questions: [{ ...valid.questions[0]!, options: [option("empty", "")] }],
      }),
    ).toThrow("invalid");
  });
  it("requires 1–50 valid questions and 2–11 choice options at activation", () => {
    expect(() => validateActivation([])).toThrow("between 1 and 50");
    expect(() =>
      validateActivation([
        { ...valid.questions[0]!, options: [option("one", "A")] },
      ]),
    ).toThrow("between 2 and 11");
    expect(() => validateActivation([valid.questions[1]!])).not.toThrow();
    expect(() => validateActivation(valid.questions)).not.toThrow();
  });
  it("accepts forward and End branches but rejects backward and missing destinations", () => {
    const forward = structuredClone(valid);
    forward.questions[0]!.options[0]!.destination = {
      type: "QUESTION",
      questionId: "q2",
    };
    forward.questions[0]!.options[1]!.destination = { type: "END" };
    expect(() => normalizeDraft(forward)).not.toThrow();

    const backward = structuredClone(valid);
    backward.questions[1] = {
      id: "q2",
      prompt: "Second choice",
      type: "SINGLE_CHOICE",
      required: false,
      options: [
        {
          ...option("back-1", "Back"),
          destination: { type: "QUESTION", questionId: "q1" },
        },
        option("back-2", "Next"),
      ],
    };
    expect(() => normalizeDraft(backward)).toThrow("later question");

    const missing = structuredClone(valid);
    missing.questions[0]!.options[0]!.destination = {
      type: "QUESTION",
      questionId: "missing",
    };
    expect(() => normalizeDraft(missing)).toThrow("missing question");
  });
  it("rejects branching on non-single-choice questions", () => {
    const malformed = structuredClone(valid);
    malformed.questions[0]!.type = "MULTIPLE_CHOICE";
    malformed.questions[0]!.options[0]!.destination = { type: "END" };
    expect(() => normalizeDraft(malformed)).toThrow("Only single-choice");
  });
  it("copies branching while remapping stable IDs for a duplicated Draft", () => {
    const source = structuredClone(detail.questions);
    source[0]!.options[0]!.destination = {
      type: "QUESTION",
      questionId: source[1]!.id,
    };
    const copy = duplicateQuestionnaire(source);
    expect(copy[0]!.id).not.toBe(source[0]!.id);
    expect(copy[0]!.options[0]!.destination).toEqual({
      type: "QUESTION",
      questionId: copy[1]!.id,
    });
  });
});

describe("survey authorization and lifecycle", () => {
  it.each([owner, researcher, admin])(
    "allows every authenticated role to create",
    async (actor) => {
      const repo = new Repo();
      await new SurveyService(repo).create(actor, valid);
      expect(repo.created).toEqual(valid);
    },
  );
  it("assigns creation ownership from the authenticated actor", async () => {
    const repo = new Repo();
    await new SurveyService(repo).create(owner, valid);
    expect(repo.created).toBeDefined();
  });
  it.each([other, researcher, null])(
    "denies Draft edits to non-owner Product Manager, non-owner Researcher, and unauthenticated actors",
    async (actor) => {
      const repo = new Repo();
      await expect(
        new SurveyService(repo).update(actor, "survey", valid),
      ).rejects.toMatchObject({
        code: actor ? "FORBIDDEN" : "AUTHENTICATION_REQUIRED",
      });
      expect(repo.updated).toBeUndefined();
    },
  );
  it("allows the owner to edit a Draft", async () => {
    const repo = new Repo();
    await new SurveyService(repo).update(owner, "survey", valid);
    expect(repo.updated).toEqual(valid);
  });
  it("allows a Researcher owner to edit their own Draft", async () => {
    const repo = new Repo();
    repo.survey = { ...detail, ownerId: researcher.id };
    await new SurveyService(repo).update(researcher, "survey", valid);
    expect(repo.updated).toEqual(valid);
  });
  it("allows an Admin to edit their own Draft", async () => {
    const repo = new Repo();
    await new SurveyService(repo).update(adminOwner, "survey", valid);
    expect(repo.updated).toEqual(valid);
  });
  it("allows an Admin to edit another employee's Draft", async () => {
    const repo = new Repo();
    await new SurveyService(repo).update(admin, "survey", valid);
    expect(repo.updated).toEqual(valid);
  });
  it.each(["ACTIVE", "PENDING_CAPACITY", "COMPLETED"] as const)(
    "denies Admin instrument edits after the survey reaches %s",
    async (status) => {
      const repo = new Repo();
      repo.survey = {
        ...detail,
        status,
        pauseReason: status === "PENDING_CAPACITY" ? "MANUAL" : null,
        completedAt: status === "COMPLETED" ? new Date() : null,
      };
      await expect(
        new SurveyService(repo).update(admin, "survey", valid),
      ).rejects.toMatchObject({ code: "SURVEY_CONFLICT" });
      expect(repo.updated).toBeUndefined();
    },
  );
  it("allows owner and Admin lifecycle management but denies another employee", async () => {
    for (const actor of [owner, admin]) {
      const repo = new Repo();
      await new SurveyService(repo).transition(actor, "survey", "ACTIVE", 1);
      expect(repo.transitioned?.target).toBe("ACTIVE");
    }
    await expect(
      new SurveyService(new Repo()).transition(other, "survey", "ACTIVE", 1),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("enforces the exact state graph and permanent completion", async () => {
    const repo = new Repo();
    repo.survey = { ...detail, status: "COMPLETED", completedAt: new Date() };
    await expect(
      new SurveyService(repo).transition(owner, "survey", "ACTIVE", 1),
    ).rejects.toMatchObject({ code: "SURVEY_CONFLICT" });
  });
  it("allows only Admin deletion/tombstoning", async () => {
    await expect(
      new SurveyService(new Repo()).remove(owner, "survey"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      new SurveyService(new Repo()).remove(null, "survey"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(
      new SurveyService(new Repo()).remove(admin, "survey"),
    ).resolves.toEqual({ tombstoned: true });
  });
});
