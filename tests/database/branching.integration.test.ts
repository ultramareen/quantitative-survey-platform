import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PgSurveyRepository } from "@/server/modules/surveys/repository";
import { SurveyService } from "@/server/modules/surveys/service";
import { PublicAttemptService } from "@/server/modules/attempts/service";
import { PgRespondentRepository } from "@/server/modules/respondents/repository";
import { PublicRespondentService } from "@/server/modules/respondents/service";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import type { EmployeePrincipal } from "@/types/employee";
import type { SurveyDraftInput } from "@/types/survey";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const surveys = new SurveyService(new PgSurveyRepository(pool));
const owner: EmployeePrincipal = {
  id: randomUUID(),
  email: "branch@synthetic.invalid",
  displayName: "Branch test",
  role: "ADMIN",
  authorizationVersion: 1,
};
const crypto = {
  piiEncryptionKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 41)]]),
  ),
  phoneLookupKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 42)]]),
  ),
  rateLimitHmacKey: Buffer.alloc(32, 43),
};
const respondents = new PublicRespondentService(
  new PgRespondentRepository(pool),
  crypto,
);
const attempts = new PublicAttemptService(pool, crypto);
function instrument(): SurveyDraftInput {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  return {
    title: "Branch database test",
    questions: [
      {
        id: ids[0]!,
        prompt: "Route",
        type: "SINGLE_CHOICE",
        required: true,
        options: [
          { id: randomUUID(), label: "Next", destination: { type: "NEXT" } },
          {
            id: randomUUID(),
            label: "Skip",
            destination: { type: "QUESTION", questionId: ids[2]! },
          },
          { id: randomUUID(), label: "End", destination: { type: "END" } },
        ],
      },
      ...ids
        .slice(1)
        .map((id) => ({
          id,
          prompt: "Required text",
          type: "FREE_TEXT" as const,
          required: true,
          options: [],
        })),
    ],
  };
}
beforeAll(async () => {
  await pool.query(
    "INSERT INTO users (id,email_normalized,display_name,email_verified,role,authorization_version,updated_at) VALUES ($1,$2,$3,true,'ADMIN',1,now())",
    [owner.id, owner.email, owner.displayName],
  );
});
afterAll(async () => {
  await pool.end();
});

it("persists and replaces NEXT, QUESTION and END destinations and enforces the DB shape constraint", async () => {
  const input = instrument();
  const { id } = await surveys.create(owner, input);
  expect(
    (await surveys.view(owner, id)).questions[0]!.options.map(
      (o) => o.destination,
    ),
  ).toEqual(input.questions[0]!.options.map((o) => o.destination));
  await expect(
    pool.query(
      "UPDATE answer_options SET branch_ends_survey=true WHERE survey_id=$1 AND branch_destination_question_id IS NOT NULL",
      [id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  input.questions[0]!.options[1]!.destination = { type: "NEXT" };
  await surveys.update(owner, id, input);
  expect(
    (await surveys.view(owner, id)).questions[0]!.options[1]!.destination,
  ).toEqual({ type: "NEXT" });
});

it("rejects missing/backward branch updates without changing the persisted instrument", async () => {
  const input = instrument();
  const { id } = await surveys.create(owner, input);
  const before = await surveys.view(owner, id);
  for (const questionId of [randomUUID(), input.questions[0]!.id]) {
    const invalid = structuredClone(input);
    invalid.questions[0]!.options[1]!.destination = {
      type: "QUESTION",
      questionId,
    };
    await expect(surveys.update(owner, id, invalid)).rejects.toBeTruthy();
    expect((await surveys.view(owner, id)).questions).toEqual(before.questions);
  }
});

it("duplicates persisted branching with fresh question and option IDs and remapped destinations", async () => {
  const { id } = await surveys.create(owner, instrument());
  const original = await surveys.view(owner, id);
  const copy = await surveys.view(
    owner,
    (await surveys.duplicate(owner, id)).id,
  );
  expect(copy.status).toBe("DRAFT");
  expect(copy.questions).toHaveLength(3);
  expect(copy.questions[0]!.options.map((o) => o.destination)).toEqual([
    { type: "NEXT" },
    { type: "QUESTION", questionId: copy.questions[2]!.id },
    { type: "END" },
  ]);
  for (let i = 0; i < 3; i++)
    expect(copy.questions[i]!.id).not.toBe(original.questions[i]!.id);
  for (let i = 0; i < 3; i++)
    expect(copy.questions[0]!.options[i]!.id).not.toBe(
      original.questions[0]!.options[i]!.id,
    );
});

it("persists reachable paths, prunes stale answers, rejects unreachable writes, and submits only the reachable required path", async () => {
  const { id } = await surveys.create(owner, instrument());
  const survey = await surveys.view(owner, id);
  await surveys.transition(owner, id, "ACTIVE", survey.stateVersion);
  const opened = await respondents.open(
    survey.publicId,
    undefined,
    "branch-open",
  );
  const identified = await respondents.identify(
    survey.publicId,
    opened.newOpenToken!,
    { name: "Synthetic Branch", phone: "202-555-0123", country: "US" },
    "branch-identify",
  );
  const token = identified.newAttemptToken!;
  let state = await attempts.load(survey.publicId, token);
  const save = async (questionPosition: number, value: number | string) => {
    state = await attempts.mutate(survey.publicId, token, {
      questionPosition,
      value,
      generation: state.generation,
      baseRevision: state.revision,
      mutationId: randomUUID(),
    });
  };
  await save(1, 1);
  await save(2, "stale");
  await save(3, "retained");
  await save(1, 2);
  expect((await attempts.load(survey.publicId, token)).answers).toEqual({
    "1": 2,
    "3": "retained",
  });
  expect(
    (
      await pool.query(
        "SELECT answered_question_count,coverage_basis_count FROM response_attempts WHERE survey_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ answered_question_count: 2, coverage_basis_count: 2 });
  await expect(save(2, "unreachable")).rejects.toMatchObject({
    code: "INVALID_ANSWER",
  });
  expect(
    await attempts.submit(survey.publicId, token, {
      generation: state.generation,
      baseRevision: state.revision,
    }),
  ).toEqual({ submitted: true, analyticallyComplete: true });
  await save(1, 3);
  expect((await attempts.load(survey.publicId, token)).answers).toEqual({
    "1": 3,
  });
  expect(
    (
      await pool.query(
        "SELECT answered_question_count,coverage_basis_count FROM response_attempts WHERE survey_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ answered_question_count: 1, coverage_basis_count: 1 });
  expect(
    await attempts.submit(survey.publicId, token, {
      generation: state.generation,
      baseRevision: state.revision,
    }),
  ).toEqual({ submitted: true, analyticallyComplete: true });
  await save(1, 1);
  expect((await attempts.load(survey.publicId, token)).answers).toEqual({
    "1": 1,
  });
  expect(
    await attempts.submit(survey.publicId, token, {
      generation: state.generation,
      baseRevision: state.revision,
    }),
  ).toEqual({ submitted: false, missingRequiredPositions: [2, 3] });
});
