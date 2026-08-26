export const syntheticIds = {
  admin: "00000000-0000-4000-8000-000000000001",
  researcher: "00000000-0000-4000-8000-000000000002",
  surveyA: "00000000-0000-4000-8000-000000000101",
  surveyB: "00000000-0000-4000-8000-000000000102",
  questionA: "00000000-0000-4000-8000-000000000201",
  questionB: "00000000-0000-4000-8000-000000000202",
  sessionA: "00000000-0000-4000-8000-000000000301",
  sessionB: "00000000-0000-4000-8000-000000000302",
  respondentA: "00000000-0000-4000-8000-000000000401",
  respondentB: "00000000-0000-4000-8000-000000000402",
  attemptA: "00000000-0000-4000-8000-000000000501",
} as const;

export const syntheticBytes = {
  nameCiphertext: Buffer.from("synthetic-name-ciphertext"),
  phoneCiphertext: Buffer.from("synthetic-phone-ciphertext"),
  payloadCiphertext: Buffer.from("synthetic-answer-payload-ciphertext"),
  nonce: Buffer.alloc(12, 7),
  phoneHash: Buffer.alloc(32, 11),
  tokenHashA: Buffer.alloc(32, 21),
  tokenHashB: Buffer.alloc(32, 22),
} as const;

export const syntheticNow = new Date("2026-01-01T00:00:00.000Z");
