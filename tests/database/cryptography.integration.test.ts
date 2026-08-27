import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  encryptEnvelope,
  type EncryptionContext,
} from "@/server/modules/cryptography/aes-gcm";
import { createPhoneLookupHmac } from "@/server/modules/cryptography/hmac";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import {
  generateSecureToken,
  hashSecureToken,
} from "@/server/modules/cryptography/tokens";

const { Client } = pg;
const ids = {
  user: "20000000-0000-4000-8000-000000000001",
  survey: "20000000-0000-4000-8000-000000000002",
  respondent: "20000000-0000-4000-8000-000000000003",
  session: "20000000-0000-4000-8000-000000000004",
  attempt: "20000000-0000-4000-8000-000000000005",
};
const syntheticPlaintext = {
  name: "Phase Two Synthetic Respondent",
  phone: "+12025550198",
  payload:
    '{"singleChoice":"PRIVATE_SINGLE","multipleChoice":["PRIVATE_MULTI_A","PRIVATE_MULTI_B"],"freeText":"PRIVATE_FREE_TEXT"}',
};
const encryptionKeys = new VersionedKeyRegistry(
  1,
  new Map([[1, Buffer.alloc(32, 41)]]),
);
const phoneKeys = new VersionedKeyRegistry(
  1,
  new Map([[1, Buffer.alloc(32, 42)]]),
);

function context(purpose: EncryptionContext["purpose"], recordId: string) {
  return { purpose, recordId, contextVersion: 1 };
}

describe("Phase 2 encrypted database persistence", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    const name = encryptEnvelope(
      syntheticPlaintext.name,
      context("RESPONDENT_NAME", ids.respondent),
      encryptionKeys,
    );
    const phone = encryptEnvelope(
      syntheticPlaintext.phone,
      context("RESPONDENT_PHONE", ids.respondent),
      encryptionKeys,
    );
    const payload = encryptEnvelope(
      syntheticPlaintext.payload,
      context("ANSWER_PAYLOAD", ids.attempt),
      encryptionKeys,
    );
    const phoneLookup = createPhoneLookupHmac(
      ids.survey,
      syntheticPlaintext.phone,
      phoneKeys,
    );
    const now = new Date("2026-08-27T00:00:00.000Z");

    await client.query(
      `INSERT INTO users (id, email_normalized, display_name, role, updated_at)
       VALUES ($1, 'phase2@synthetic.invalid', 'Phase 2 Synthetic', 'ADMIN', $2)`,
      [ids.user, now],
    );
    await client.query(
      `INSERT INTO surveys (id, public_id, owner_id, title, updated_at)
       VALUES ($1, 'phase2-synthetic-survey', $2, 'Phase 2 Synthetic Survey', $3)`,
      [ids.survey, ids.user, now],
    );
    await client.query(
      `INSERT INTO respondents (
         id, survey_id, reference_id, name_ciphertext, name_nonce, name_key_version,
         phone_ciphertext, phone_nonce, phone_key_version, phone_lookup_hash,
         phone_lookup_key_version, identified_at, last_activity_at, updated_at
       ) VALUES ($1, $2, 'R-2CRYPT0TST99', $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)`,
      [
        ids.respondent,
        ids.survey,
        name.sealedPayload,
        name.nonce,
        name.keyVersion,
        phone.sealedPayload,
        phone.nonce,
        phone.keyVersion,
        phoneLookup.digest,
        phoneLookup.keyVersion,
        now,
      ],
    );
    await client.query(
      `INSERT INTO public_survey_sessions (
         id, survey_id, respondent_id, open_token_hash, created_while_status,
         first_opened_at, last_seen_at
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)`,
      [
        ids.session,
        ids.survey,
        ids.respondent,
        hashSecureToken(generateSecureToken()),
        now,
      ],
    );
    await client.query(
      `INSERT INTO response_attempts (
         id, survey_id, respondent_id, public_survey_session_id, generation,
         attempt_number, attempt_token_hash, payload_ciphertext, payload_nonce,
         payload_key_version, payload_schema_version, coverage_basis_count,
         created_at, last_activity_at
       ) VALUES ($1, $2, $3, $4, 1, 1, $5, $6, $7, $8, 1, 1, $9, $9)`,
      [
        ids.attempt,
        ids.survey,
        ids.respondent,
        ids.session,
        hashSecureToken(generateSecureToken()),
        payload.sealedPayload,
        payload.nonce,
        payload.keyVersion,
        now,
      ],
    );
  });

  afterAll(async () => client.end());

  it("contains no synthetic name, phone, choice, multiple-choice, or free-text plaintext", async () => {
    const result = await client.query(
      `SELECT r.name_ciphertext, r.name_nonce, r.phone_ciphertext, r.phone_nonce,
              r.phone_lookup_hash, a.payload_ciphertext, a.payload_nonce
       FROM respondents r
       JOIN response_attempts a ON a.respondent_id = r.id
       WHERE r.id = $1`,
      [ids.respondent],
    );
    const rawDatabaseBytes = Buffer.concat(
      Object.values(result.rows[0] as Record<string, Buffer>),
    );
    for (const forbidden of [
      syntheticPlaintext.name,
      syntheticPlaintext.phone,
      "PRIVATE_SINGLE",
      "PRIVATE_MULTI_A",
      "PRIVATE_MULTI_B",
      "PRIVATE_FREE_TEXT",
    ]) {
      expect(rawDatabaseBytes.includes(Buffer.from(forbidden, "utf8"))).toBe(
        false,
      );
    }
  });
});
