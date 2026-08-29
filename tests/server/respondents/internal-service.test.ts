import { describe, expect, it } from "vitest";
import { encryptEnvelope } from "@/server/modules/cryptography";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import type {
  InternalRespondentQuery,
  InternalRespondentRepository,
  InternalRespondentRow,
} from "@/server/modules/respondents/internal-repository";
import { InternalRespondentService } from "@/server/modules/respondents/internal-service";
import type { EmployeePrincipal } from "@/types/employee";

const registry = new VersionedKeyRegistry(
  1,
  new Map([[1, Buffer.alloc(32, 1)]]),
);
const crypto = {
  piiEncryptionKeys: registry,
  phoneLookupKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 2)]]),
  ),
  rateLimitHmacKey: Buffer.alloc(32, 3),
};
const respondentId = "00000000-0000-4000-8000-000000000001";
const surveyId = "00000000-0000-4000-8000-000000000002";
const referenceId = "R-7K3M9W2X8Q4D";

function envelope(
  value: string,
  purpose: "RESPONDENT_NAME" | "RESPONDENT_PHONE",
) {
  return encryptEnvelope(
    value,
    { purpose, recordId: respondentId, contextVersion: 1 },
    registry,
  );
}
const name = envelope("Synthetic Person", "RESPONDENT_NAME");
const phone = envelope("+12025550123", "RESPONDENT_PHONE");
const row: InternalRespondentRow = {
  respondent_id: respondentId,
  reference_id: referenceId,
  name_ciphertext: name.sealedPayload,
  name_nonce: name.nonce,
  name_key_version: name.keyVersion,
  phone_ciphertext: phone.sealedPayload,
  phone_nonce: phone.nonce,
  phone_key_version: phone.keyVersion,
  identified_at: new Date("2026-08-28T00:00:00Z"),
  respondent_last_activity_at: new Date("2026-08-28T03:00:00Z"),
  survey_id: surveyId,
  survey_title: "Cross-survey study",
  survey_status: "ACTIVE",
  answered_question_count: 2,
  coverage_basis_count: 4,
  attempt_created_at: new Date("2026-08-28T00:00:00Z"),
  started_at: new Date("2026-08-28T01:00:00Z"),
  last_answer_changed_at: new Date("2026-08-28T03:00:00Z"),
};

class Repo implements InternalRespondentRepository {
  queries: InternalRespondentQuery[] = [];
  audits: Parameters<InternalRespondentRepository["audit"]>[0][] = [];
  listCalls = 0;
  detailCalls = 0;
  async list(input: InternalRespondentQuery) {
    this.listCalls++;
    this.queries.push(input);
    return { rows: [row], total: 1 };
  }
  async detail() {
    this.detailCalls++;
    return row;
  }
  async audit(input: Parameters<InternalRespondentRepository["audit"]>[0]) {
    this.audits.push(input);
  }
}
const principals = {
  researcher: {
    id: "researcher",
    email: "researcher@synthetic.invalid",
    displayName: "Researcher",
    role: "RESEARCHER",
    authorizationVersion: 1,
  } satisfies EmployeePrincipal,
  admin: {
    id: "admin",
    email: "admin@synthetic.invalid",
    displayName: "Admin",
    role: "ADMIN",
    authorizationVersion: 1,
  } satisfies EmployeePrincipal,
  productManager: {
    id: "pm",
    email: "pm@synthetic.invalid",
    displayName: "PM",
    role: "PRODUCT_MANAGER",
    authorizationVersion: 1,
  } satisfies EmployeePrincipal,
};
function fixture(now = "2026-08-28T04:00:00Z") {
  const repo = new Repo();
  return {
    repo,
    service: new InternalRespondentService(repo, crypto, () => new Date(now)),
  };
}

describe("internal respondent PII service", () => {
  it.each([principals.researcher, principals.admin])(
    "allows $role to search across surveys and decrypts only approved DTO fields",
    async (principal) => {
      const { repo, service } = fixture();
      const result = await service.list(principal, {
        referenceId: " r-7k3m9w2x8q4d ",
      });
      expect(repo.queries[0]).toMatchObject({
        referenceId,
        page: 1,
        pageSize: 50,
      });
      expect(result.respondents[0]).toEqual({
        referenceId,
        name: "Synthetic Person",
        phone: "+12025550123",
        survey: { id: surveyId, title: "Cross-survey study", status: "ACTIVE" },
        coverage: { answeredQuestions: 2, totalQuestions: 4, percentage: 50 },
        startedAt: "2026-08-28T01:00:00.000Z",
        lastAnswerChangedAt: "2026-08-28T03:00:00.000Z",
        identifiedAt: "2026-08-28T00:00:00.000Z",
        lastActivityAt: "2026-08-28T03:00:00.000Z",
        state: "EDITABLE",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /cipher|nonce|keyVersion|lookup|attemptId/,
      );
      expect(repo.audits[0]).toMatchObject({
        action: "RESPONDENT_PII_SEARCHED",
        targetId: referenceId,
        affectedRows: 1,
      });
    },
  );

  it("returns 403 before Product Manager repository access or decryption", async () => {
    const { repo, service } = fixture();
    await expect(
      service.list(principals.productManager, {}),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.detail(principals.productManager, referenceId),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(repo.listCalls).toBe(0);
    expect(repo.detailCalls).toBe(0);
    expect(repo.audits).toEqual([]);
  });

  it("requires an authenticated, current principal before access", async () => {
    const { repo, service } = fixture();
    await expect(service.list(null, {})).rejects.toMatchObject({ status: 401 });
    expect(repo.listCalls).toBe(0);
  });

  it("derives locked state after 24 hours and for completed surveys", async () => {
    const { service } = fixture("2026-08-29T03:00:00Z");
    await expect(
      service.detail(principals.researcher, referenceId),
    ).resolves.toMatchObject({
      state: "LOCKED",
    });
  });

  it.each(["R-TOO-SHORT", "name", "+12025550123"])(
    "rejects invalid exact reference search %s",
    async (value) => {
      const { repo, service } = fixture();
      await expect(
        service.list(principals.researcher, { referenceId: value }),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.listCalls).toBe(0);
    },
  );
});
