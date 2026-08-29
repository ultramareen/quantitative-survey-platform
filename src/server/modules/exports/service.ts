import "server-only";

import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { AppError } from "@/server/errors/app-error";
import {
  requireAuthenticated,
  requirePiiAccess,
} from "@/server/modules/auth/policies";
import { decryptEnvelope } from "@/server/modules/cryptography";
import type { CryptographyConfiguration } from "@/server/modules/cryptography/key-registry";
import type { EmployeePrincipal } from "@/types/employee";
import type { QuestionResult } from "@/types/results";
import type { ExportAttemptRow, ExportQuestion } from "./repository";
import { ExportRepository } from "./repository";
import type { ExportRequest, ExportResult } from "./types";

const MAX_PREDICTED_BYTES = 4 * 1024 * 1024;
const MAX_PREDICTED_MILLIS = 10_000;
const PREDICTED_ROW_MILLIS = 4;
const BASE_ROW_BYTES = 512;

type Answer = number | number[] | string;
type Payload = { answers: Record<string, Answer> };

export class ExportService {
  constructor(
    private readonly repository: ExportRepository,
    private readonly cryptography: CryptographyConfiguration,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    principal: EmployeePrincipal | null,
    surveyId: string,
    request: ExportRequest,
  ): Promise<ExportResult> {
    const actor = requireAuthenticated(principal);
    if (request.kind !== "aggregate") requirePiiAccess(principal);
    const survey = await this.repository.survey(surveyId);
    if (!survey) throw unavailable();
    if (!Number.isInteger(request.part) || request.part < 1) throw invalid();

    if (request.kind === "aggregate")
      return this.aggregate(actor, surveyId, survey.title, request);

    const questions = await this.repository.questions(surveyId);
    if (request.kind === "free-text") {
      if (!Number.isInteger(request.questionPosition)) throw invalid();
      const selected = questions.find(
        (question) => question.position === request.questionPosition,
      );
      if (!selected || selected.type !== "FREE_TEXT") throw invalid();
    }
    const status = request.kind === "archived" ? "ARCHIVED" : "CURRENT";
    const estimate = await this.repository.attemptEstimate(surveyId, status);
    const averagePayloadBytes =
      estimate.count === 0
        ? 0
        : Math.ceil(estimate.payload_bytes / estimate.count);
    const rowLimit = partitionSize(questions.length, averagePayloadBytes);
    const totalParts = Math.max(1, Math.ceil(estimate.count / rowLimit));
    if (request.part > totalParts) throw invalid();
    const rows = await this.repository.attempts(
      surveyId,
      status,
      rowLimit,
      (request.part - 1) * rowLimit,
    );
    const exportedAt = this.clock();
    const stream = this.respondentWorkbook(
      survey.title,
      request,
      questions,
      rows,
      exportedAt,
      totalParts,
    );
    await this.repository.audit({
      actorId: actor.id,
      surveyId,
      action: `RESPONDENT_${request.kind.replace("-", "_").toUpperCase()}_EXPORTED`,
      affectedRows: rows.length,
      safeMetadata: {
        kind: request.kind,
        questionPosition: request.questionPosition,
        part: request.part,
        totalParts,
      },
    });
    return {
      stream,
      filename: filename(survey.title, request, exportedAt, totalParts),
      exportedAt: exportedAt.toISOString(),
      sourceAt: exportedAt.toISOString(),
      part: request.part,
      totalParts,
      rowCount: rows.length,
    };
  }

  private async aggregate(
    actor: EmployeePrincipal,
    surveyId: string,
    surveyTitle: string,
    request: ExportRequest,
  ): Promise<ExportResult> {
    if (!Number.isInteger(request.snapshotNumber)) throw invalid();
    const snapshot = await this.repository.snapshot(
      surveyId,
      request.snapshotNumber!,
    );
    if (!snapshot) throw unavailable();
    const exportedAt = this.clock();
    const stream = new PassThrough();
    void writeAggregate(stream, surveyTitle, snapshot, this.cryptography).catch(
      (error) => stream.destroy(error as Error),
    );
    void actor;
    return {
      stream,
      filename: filename(surveyTitle, request, exportedAt, 1),
      exportedAt: exportedAt.toISOString(),
      sourceAt: new Date(snapshot.data_cutoff_at as Date).toISOString(),
      part: 1,
      totalParts: 1,
      rowCount: 1,
    };
  }

  private respondentWorkbook(
    surveyTitle: string,
    request: ExportRequest,
    questions: ExportQuestion[],
    rows: ExportAttemptRow[],
    exportedAt: Date,
    totalParts: number,
  ) {
    const stream = new PassThrough();
    void writeRespondents(
      stream,
      surveyTitle,
      request,
      questions,
      rows,
      exportedAt,
      totalParts,
      this.cryptography,
    )
      .catch((error) => stream.destroy(error as Error))
      .finally(() => {
        for (const row of rows) scrub(row);
        rows.length = 0;
      });
    stream.once("close", () => {
      for (const row of rows) scrub(row);
      rows.length = 0;
    });
    return stream;
  }
}

export function neutralizeSpreadsheetText(value: unknown): string {
  const text = value == null ? "" : String(value);
  const dangerous = /^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text);
  return dangerous ? `'${text}` : text;
}

export function partitionSize(questionCount: number, averagePayloadBytes = 0) {
  const predictedBytes =
    BASE_ROW_BYTES + questionCount * 256 + averagePayloadBytes;
  return Math.max(
    1,
    Math.min(
      Math.floor(MAX_PREDICTED_BYTES / predictedBytes),
      Math.floor(MAX_PREDICTED_MILLIS / PREDICTED_ROW_MILLIS),
    ),
  );
}

async function writeRespondents(
  stream: PassThrough,
  surveyTitle: string,
  request: ExportRequest,
  questions: ExportQuestion[],
  rows: ExportAttemptRow[],
  exportedAt: Date,
  totalParts: number,
  cryptography: CryptographyConfiguration,
) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
  const sheet = workbook.addWorksheet("Export");
  sheet.addRow(["Survey", neutralizeSpreadsheetText(surveyTitle)]).commit();
  sheet.addRow(["Source", "Current state at export time"]).commit();
  sheet.addRow(["Exported at", exportedAt.toISOString()]).commit();
  sheet.addRow(["Partition", `${request.part} of ${totalParts}`]).commit();
  sheet.addRow([]).commit();
  const selected = questions.find(
    (q) => q.position === request.questionPosition,
  );
  const metadata = [
    "Reference ID",
    "Name",
    "Phone",
    "Attempt number",
    "Attempt created at",
    "Started at",
    "Last answer changed at",
  ];
  if (request.kind === "archived")
    metadata.push("Archived at", "Archive reason");
  const headers =
    request.kind === "free-text"
      ? [
          "Reference ID",
          "Name",
          "Phone",
          `Q${selected!.position}: ${selected!.prompt}`,
        ]
      : [...metadata, ...questions.map((q) => `Q${q.position}: ${q.prompt}`)];
  sheet.addRow(headers.map(neutralizeSpreadsheetText)).commit();
  for (const row of rows) {
    const name = decryptField(row, "NAME", cryptography);
    const phone = decryptField(row, "PHONE", cryptography);
    const payload = decryptPayload(row, cryptography);
    const answer = (question: ExportQuestion) =>
      formatAnswer(payload.answers[String(question.position)], question);
    const values =
      request.kind === "free-text"
        ? [row.reference_id, name, phone, answer(selected!)]
        : [
            row.reference_id,
            name,
            phone,
            row.attempt_number,
            row.created_at.toISOString(),
            row.started_at?.toISOString() ?? "",
            row.last_answer_changed_at?.toISOString() ?? "",
            ...(request.kind === "archived"
              ? [row.archived_at?.toISOString() ?? "", row.archive_reason ?? ""]
              : []),
            ...questions.map(answer),
          ];
    const excelRow = sheet.addRow(values.map(neutralizeSpreadsheetText));
    excelRow.eachCell((cell) => {
      cell.numFmt = "@";
    });
    excelRow.commit();
  }
  await workbook.commit();
}

async function writeAggregate(
  stream: PassThrough,
  surveyTitle: string,
  snapshot: Record<string, unknown>,
  cryptography: CryptographyConfiguration,
) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
  const summary = workbook.addWorksheet("Snapshot summary");
  const aggregate =
    typeof snapshot.aggregate_results === "string"
      ? JSON.parse(snapshot.aggregate_results)
      : snapshot.aggregate_results;
  const data = aggregate as {
    funnel: Record<string, number>;
    questions: QuestionResult[];
  };
  const freeText = decryptSnapshotFreeText(snapshot, cryptography);
  const freeTextByPosition = new Map(
    freeText.map((item) => [item.position, item.groups]),
  );
  for (const row of [
    ["Survey", neutralizeSpreadsheetText(surveyTitle)],
    ["Source", `Immutable ResultsSnapshot ${snapshot.snapshot_number}`],
    ["Data cutoff", new Date(snapshot.data_cutoff_at as Date).toISOString()],
    [],
    ["Metric", "Count", "Percentage"],
    ["Opened", data.funnel.opened, ""],
    ["Identified", data.funnel.identified, ""],
    ["Started", data.funnel.started, data.funnel.startedPercentage],
    [
      ">50%",
      data.funnel.greaterThanHalf,
      data.funnel.greaterThanHalfPercentage,
    ],
    ["Completed", data.funnel.completed, data.funnel.completedPercentage],
  ])
    summary.addRow(row).commit();
  const results = workbook.addWorksheet("Question results");
  results.addRow([
    "Question",
    "Type",
    "Respondents",
    "Result",
    "Count",
    "Percentage",
    "Leader",
  ]);
  for (const question of data.questions) {
    const entries =
      question.type === "FREE_TEXT"
        ? (freeTextByPosition.get(question.position) ?? [])
        : (question.options ?? []);
    if (!entries.length) {
      results
        .addRow([
          `${question.position}. ${neutralizeSpreadsheetText(question.prompt)}`,
          question.type,
          question.denominator,
          question.truncated
            ? `Top 10 of ${question.uniqueGroupCount}`
            : "Grouped free text",
          "",
          "",
          "",
        ])
        .commit();
      continue;
    }
    for (const option of entries)
      results
        .addRow([
          `${question.position}. ${neutralizeSpreadsheetText(question.prompt)}`,
          question.type,
          question.denominator,
          neutralizeSpreadsheetText(option.label),
          option.count,
          option.percentage,
          option.leader ? "Yes" : "No",
        ])
        .commit();
  }
  await workbook.commit();
}

function decryptField(
  row: ExportAttemptRow,
  field: "NAME" | "PHONE",
  crypto: CryptographyConfiguration,
) {
  const lower = field.toLowerCase() as "name" | "phone";
  return decryptEnvelope(
    {
      sealedPayload: row[`${lower}_ciphertext`],
      nonce: row[`${lower}_nonce`],
      keyVersion: row[`${lower}_key_version`],
      envelopeVersion: 1,
    },
    {
      purpose: `RESPONDENT_${field}`,
      recordId: respondentRecordId(row),
      contextVersion: 1,
    },
    crypto.piiEncryptionKeys,
  ).toString("utf8");
}

function respondentRecordId(row: ExportAttemptRow) {
  return row.respondent_id;
}

function decryptSnapshotFreeText(
  snapshot: Record<string, unknown>,
  crypto: CryptographyConfiguration,
): {
  position: number;
  groups: NonNullable<QuestionResult["freeTextGroups"]>;
}[] {
  if (!snapshot.free_text_ciphertext) return [];
  return JSON.parse(
    decryptEnvelope(
      {
        sealedPayload: snapshot.free_text_ciphertext as Buffer,
        nonce: snapshot.free_text_nonce as Buffer,
        keyVersion: snapshot.free_text_key_version as number,
        envelopeVersion: 1,
      },
      {
        purpose: "RESULT_FREE_TEXT_LABELS",
        recordId: snapshot.id as string,
        contextVersion: 1,
      },
      crypto.piiEncryptionKeys,
    ).toString("utf8"),
  );
}

function decryptPayload(
  row: ExportAttemptRow,
  crypto: CryptographyConfiguration,
): Payload {
  return JSON.parse(
    decryptEnvelope(
      {
        sealedPayload: row.payload_ciphertext,
        nonce: row.payload_nonce,
        keyVersion: row.payload_key_version,
        envelopeVersion: 1,
      },
      {
        purpose: "ANSWER_PAYLOAD",
        recordId: row.attempt_id,
        contextVersion: 1,
      },
      crypto.piiEncryptionKeys,
    ).toString("utf8"),
  );
}

function formatAnswer(value: Answer | undefined, question: ExportQuestion) {
  if (
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && !value.length)
  )
    return "";
  if (question.type === "FREE_TEXT") return String(value);
  const positions = Array.isArray(value) ? value : [value];
  return positions
    .map(
      (position) =>
        question.options.find((option) => option.position === position)
          ?.label ?? "",
    )
    .filter(Boolean)
    .join("; ");
}

function scrub(row: ExportAttemptRow) {
  row.name_ciphertext.fill(0);
  row.name_nonce.fill(0);
  row.phone_ciphertext.fill(0);
  row.phone_nonce.fill(0);
  row.payload_ciphertext.fill(0);
  row.payload_nonce.fill(0);
}

function filename(
  title: string,
  request: ExportRequest,
  at: Date,
  totalParts: number,
) {
  const safe =
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "survey";
  const source =
    request.kind === "aggregate"
      ? `snapshot-${request.snapshotNumber}`
      : request.kind;
  const part = totalParts > 1 ? `-part-${request.part}-of-${totalParts}` : "";
  return `${safe}-${source}-${at.toISOString().replace(/[:.]/g, "-")}${part}.xlsx`;
}

function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_EXPORT",
    message: "Invalid export request.",
    safeMessage: "The export request is invalid.",
    status: 400,
  });
}
function unavailable() {
  return new AppError({
    category: "NOT_FOUND",
    code: "EXPORT_UNAVAILABLE",
    message: "Export unavailable.",
    safeMessage: "The export is unavailable.",
    status: 404,
  });
}
