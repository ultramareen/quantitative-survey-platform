import "server-only";

import { AppError } from "@/server/errors/app-error";
import { decryptEnvelope } from "@/server/modules/cryptography";
import type { CryptographyConfiguration } from "@/server/modules/cryptography/key-registry";
import { requirePiiAccess } from "@/server/modules/auth/policies";
import type { EmployeePrincipal } from "@/types/employee";
import type {
  RespondentPiiDto,
  RespondentPiiListDto,
} from "@/types/respondent-pii";
import type {
  InternalRespondentRepository,
  InternalRespondentRow,
} from "./internal-repository";

const REFERENCE_ID = /^R-[0-9A-HJKMNP-TV-Z]{12}$/;
const SURVEY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InternalRespondentService {
  constructor(
    private readonly repository: InternalRespondentRepository,
    private readonly cryptography: CryptographyConfiguration,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(
    principal: EmployeePrincipal | null,
    input: {
      referenceId?: string;
      surveyId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<RespondentPiiListDto> {
    const actor = requirePiiAccess(principal);
    const referenceId = input.referenceId
      ? normalizeReferenceId(input.referenceId)
      : undefined;
    const surveyId = input.surveyId?.trim() || undefined;
    if (surveyId && !SURVEY_ID.test(surveyId)) throw invalid();
    const page = integer(input.page, 1, 10_000, 1);
    const pageSize = integer(input.pageSize, 1, 100, 50);
    const result = await this.repository.list({
      referenceId,
      surveyId,
      page,
      pageSize,
    });
    const respondents = result.rows.map((row) => this.dto(row));
    await this.repository.audit({
      actorId: actor.id,
      action: referenceId ? "RESPONDENT_PII_SEARCHED" : "RESPONDENT_PII_LISTED",
      targetId: referenceId,
      surveyId,
      affectedRows: respondents.length,
      safeMetadata: { page, pageSize, filteredBySurvey: Boolean(surveyId) },
    });
    return { respondents, total: result.total, page, pageSize };
  }

  async detail(
    principal: EmployeePrincipal | null,
    referenceIdInput: string,
  ): Promise<RespondentPiiDto> {
    const actor = requirePiiAccess(principal);
    const referenceId = normalizeReferenceId(referenceIdInput);
    const row = await this.repository.detail(referenceId);
    if (!row) throw missing();
    const result = this.dto(row);
    await this.repository.audit({
      actorId: actor.id,
      action: "RESPONDENT_PII_VIEWED",
      targetId: referenceId,
      surveyId: row.survey_id,
      affectedRows: 1,
    });
    return result;
  }

  private dto(row: InternalRespondentRow): RespondentPiiDto {
    const keyring = this.cryptography.piiEncryptionKeys;
    const name = decryptEnvelope(
      {
        sealedPayload: row.name_ciphertext,
        nonce: row.name_nonce,
        keyVersion: row.name_key_version,
        envelopeVersion: 1,
      },
      {
        purpose: "RESPONDENT_NAME",
        recordId: row.respondent_id,
        contextVersion: 1,
      },
      keyring,
    ).toString("utf8");
    const phone = decryptEnvelope(
      {
        sealedPayload: row.phone_ciphertext,
        nonce: row.phone_nonce,
        keyVersion: row.phone_key_version,
        envelopeVersion: 1,
      },
      {
        purpose: "RESPONDENT_PHONE",
        recordId: row.respondent_id,
        contextVersion: 1,
      },
      keyring,
    ).toString("utf8");
    const deadline =
      (row.last_answer_changed_at ?? row.attempt_created_at).getTime() +
      86_400_000;
    const editable =
      (row.survey_status === "ACTIVE" ||
        row.survey_status === "PENDING_CAPACITY") &&
      this.clock().getTime() < deadline;
    const total = row.coverage_basis_count;
    return {
      referenceId: row.reference_id,
      name,
      phone,
      survey: {
        id: row.survey_id,
        title: row.survey_title,
        status: row.survey_status,
      },
      coverage: {
        answeredQuestions: row.answered_question_count,
        totalQuestions: total,
        percentage:
          total === 0
            ? 0
            : Math.round((row.answered_question_count / total) * 10_000) / 100,
      },
      startedAt: iso(row.started_at),
      lastAnswerChangedAt: iso(row.last_answer_changed_at),
      identifiedAt: row.identified_at.toISOString(),
      lastActivityAt: row.respondent_last_activity_at.toISOString(),
      state: editable ? "EDITABLE" : "LOCKED",
    };
  }
}

function normalizeReferenceId(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!REFERENCE_ID.test(normalized)) throw invalid();
  return normalized;
}
function integer(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw invalid();
  return value;
}
function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_RESPONDENT_QUERY",
    message: "Invalid respondent query.",
    safeMessage: "The respondent query is invalid.",
    status: 400,
  });
}
function missing() {
  return new AppError({
    category: "NOT_FOUND",
    code: "RESPONDENT_NOT_FOUND",
    message: "Respondent not found.",
    safeMessage: "The respondent was not found.",
    status: 404,
  });
}
