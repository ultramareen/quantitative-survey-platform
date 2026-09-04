import { describe, expect, it } from "vitest";
import { PgInternalRespondentRepository } from "@/server/modules/respondents/internal-repository";

const surveyA = "00000000-0000-4000-8000-00000000000a";
const surveyB = "00000000-0000-4000-8000-00000000000b";
const referenceId = "R-7K3M9W2X8Q4D";

class PoolStub {
  calls: { text: string; values: unknown[] }[] = [];

  async query(text: string, values: unknown[]) {
    this.calls.push({ text, values: [...values] });
    return this.calls.length % 2 === 1
      ? { rows: [{ count: 0 }] }
      : { rows: [] };
  }
}

describe("internal respondent repository filtering", () => {
  it.each([surveyA, surveyB])(
    "scopes both rows and count to selected survey %s",
    async (surveyId) => {
      const pool = new PoolStub();
      const repository = new PgInternalRespondentRepository(pool as never);

      await expect(
        repository.list({ surveyId, page: 1, pageSize: 50 }),
      ).resolves.toEqual({ rows: [], total: 0 });

      expect(pool.calls).toHaveLength(2);
      expect(pool.calls[0]).toMatchObject({ values: [surveyId] });
      expect(pool.calls[1]).toMatchObject({ values: [surveyId, 50, 0] });
      expect(pool.calls[0]?.text).toContain("r.survey_id=$1");
      expect(pool.calls[1]?.text).toContain("r.survey_id=$1");
    },
  );

  it("requires both exact reference ID and survey to match", async () => {
    const pool = new PoolStub();
    const repository = new PgInternalRespondentRepository(pool as never);

    await repository.list({
      referenceId,
      surveyId: surveyA,
      page: 1,
      pageSize: 50,
    });

    expect(pool.calls[0]).toMatchObject({ values: [referenceId, surveyA] });
    expect(pool.calls[1]).toMatchObject({
      values: [referenceId, surveyA, 50, 0],
    });
    for (const call of pool.calls) {
      expect(call.text).toContain("r.reference_id=$1 AND r.survey_id=$2");
    }
  });
});
