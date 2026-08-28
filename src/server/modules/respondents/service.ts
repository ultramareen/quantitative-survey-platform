import "server-only";

import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors/app-error";
import {
  encryptEnvelope,
  createPhoneLookupHmac,
  createRateLimitHmac,
  generateSecureToken,
  generateRespondentReferenceId,
  hashSecureToken,
} from "@/server/modules/cryptography";
import type { CryptographyConfiguration } from "@/server/modules/cryptography/key-registry";
import type {
  PublicIdentityInput,
  PublicIdentityResult,
  PublicSurveyOpenResult,
} from "@/types/public-survey";
import { normalizePhone } from "./phone";
import type { RespondentRepository } from "./repository";

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const WINDOW_MS = 15 * 60 * 1000;

export class PublicRespondentService {
  constructor(
    private readonly repository: RespondentRepository,
    private readonly cryptography: CryptographyConfiguration,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async open(
    publicId: string,
    openToken: string | undefined,
    rateSubject: string,
  ): Promise<PublicSurveyOpenResult> {
    validatePublicId(publicId);
    await this.rateLimit("PUBLIC_SURVEY_OPEN", rateSubject, 120);
    const newToken = generateSecureToken();
    const result = await this.repository.open({
      publicId,
      tokenHash: validTokenHash(openToken),
      newTokenHash: hashSecureToken(newToken),
      now: this.clock(),
    });
    const publicResult: PublicSurveyOpenResult = {
      availability: result.availability,
      title: result.title,
      description: result.description,
      identified: result.identified,
    };
    const { createdOpen } = result;
    return createdOpen
      ? { ...publicResult, newOpenToken: newToken }
      : publicResult;
  }

  async identify(
    publicId: string,
    openToken: string | undefined,
    input: PublicIdentityInput,
    rateSubject: string,
  ): Promise<PublicIdentityResult> {
    validatePublicId(publicId);
    const openTokenHash = requiredTokenHash(openToken);
    await this.rateLimit("PUBLIC_SURVEY_IDENTIFY", rateSubject, 20);
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 200)
      throw invalid("Enter your name using at most 200 characters.");
    const phone = normalizePhone(input.phone, input.country);
    const context = await this.repository.resolveIdentityContext(
      publicId,
      openTokenHash,
    );
    if (!context) throw unavailable();
    const phoneLookup = createPhoneLookupHmac(
      context.surveyId,
      phone,
      this.cryptography.phoneLookupKeys,
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const respondentId = randomUUID();
      const attemptId = randomUUID();
      const attemptToken = generateSecureToken();
      const nameEnvelope = encryptEnvelope(
        name,
        {
          purpose: "RESPONDENT_NAME",
          recordId: respondentId,
          contextVersion: 1,
        },
        this.cryptography.piiEncryptionKeys,
      );
      const phoneEnvelope = encryptEnvelope(
        phone,
        {
          purpose: "RESPONDENT_PHONE",
          recordId: respondentId,
          contextVersion: 1,
        },
        this.cryptography.piiEncryptionKeys,
      );
      const payloadEnvelope = encryptEnvelope(
        '{"answers":{}}',
        { purpose: "ANSWER_PAYLOAD", recordId: attemptId, contextVersion: 1 },
        this.cryptography.piiEncryptionKeys,
      );
      const persisted = await this.repository.identify({
        publicId,
        openTokenHash,
        attemptTokenHash: hashSecureToken(attemptToken),
        respondentId,
        referenceId: generateRespondentReferenceId(),
        nameCiphertext: nameEnvelope.sealedPayload,
        nameNonce: nameEnvelope.nonce,
        nameKeyVersion: nameEnvelope.keyVersion,
        phoneCiphertext: phoneEnvelope.sealedPayload,
        phoneNonce: phoneEnvelope.nonce,
        phoneKeyVersion: phoneEnvelope.keyVersion,
        phoneLookupHash: phoneLookup.digest,
        phoneLookupKeyVersion: phoneLookup.keyVersion,
        attemptId,
        payloadCiphertext: payloadEnvelope.sealedPayload,
        payloadNonce: payloadEnvelope.nonce,
        payloadKeyVersion: payloadEnvelope.keyVersion,
        now: this.clock(),
      });
      if (persisted.referenceCollision) continue;
      return persisted.createdAttempt
        ? { identified: true, newAttemptToken: attemptToken }
        : { identified: true };
    }
    throw new AppError({
      category: "INTERNAL",
      code: "REFERENCE_ID_EXHAUSTED",
      message: "Reference ID allocation exhausted.",
      safeMessage: "The request could not be completed.",
      status: 500,
    });
  }

  private async rateLimit(scope: string, subject: string, limit: number) {
    const now = this.clock();
    const windowStart = new Date(
      Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS,
    );
    await this.repository.consumeRateLimit({
      scope,
      subjectHash: createRateLimitHmac(
        scope,
        subject.trim().toLowerCase().slice(0, 128) || "unknown",
        this.cryptography.rateLimitHmacKey,
      ),
      windowStart,
      expiresAt: new Date(windowStart.getTime() + WINDOW_MS * 2),
      limit,
    });
  }
}

function validatePublicId(value: string) {
  if (!PUBLIC_ID_PATTERN.test(value)) throw unavailable();
}
function validTokenHash(value: string | undefined) {
  if (!value || !TOKEN_PATTERN.test(value)) return undefined;
  try {
    return hashSecureToken(value);
  } catch {
    return undefined;
  }
}
function requiredTokenHash(value: string | undefined) {
  const hash = validTokenHash(value);
  if (!hash) throw unavailable();
  return hash;
}
function invalid(message: string) {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_PUBLIC_IDENTITY",
    message,
    safeMessage: message,
    status: 400,
  });
}
function unavailable() {
  return new AppError({
    category: "NOT_FOUND",
    code: "PUBLIC_SURVEY_UNAVAILABLE",
    message: "Public survey unavailable.",
    safeMessage: "This survey is unavailable.",
    status: 404,
  });
}
