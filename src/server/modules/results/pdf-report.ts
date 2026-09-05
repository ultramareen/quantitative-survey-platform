import "server-only";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type {
  Content,
  ContentStack,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { QuestionResult, ResultsSnapshotDto } from "@/types/results";

(
  pdfMake as unknown as {
    addVirtualFileSystem(files: Record<string, string>): void;
  }
).addVirtualFileSystem(
  (pdfFonts as unknown as { vfs?: Record<string, string> }).vfs ??
    (pdfFonts as unknown as Record<string, string>),
);

const GRAPHITE = "#262626";
const YELLOW = "#F5C242";
const LIGHT = "#E5E5E5";
const MID = "#777777";

export type PdfReportInput = {
  surveyTitle: string;
  launchedAt: string | null;
  snapshot: ResultsSnapshotDto;
};

export async function generateResultsPdf(
  input: PdfReportInput,
): Promise<Buffer> {
  const definition = buildResultsPdfDefinition(input);
  return new Promise((resolve, reject) => {
    try {
      pdfMake
        .createPdf(definition)
        .getBuffer((buffer) => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}

export function buildResultsPdfDefinition(
  input: PdfReportInput,
): TDocumentDefinitions {
  const pages = paginateQuestions(input.snapshot.questions);
  const content: Content[] = [header(input)];
  pages.forEach((questions, pageIndex) => {
    const rows: Content[][] = [];
    for (let index = 0; index < questions.length; index += 2) {
      const pair = questions.slice(index, index + 2);
      rows.push([
        questionCard(pair[0]!),
        pair[1] ? questionCard(pair[1]) : { text: "" },
      ]);
    }
    content.push({
      table: { widths: ["*", "*"], body: rows },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 7,
        paddingRight: () => 7,
        paddingTop: () => 5,
        paddingBottom: () => 9,
      },
      ...(pageIndex > 0 ? { pageBreak: "before" as const } : {}),
    });
  });
  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [34, 34, 34, 30],
    defaultStyle: { font: "Roboto", color: LIGHT, fontSize: 9 },
    background: () => ({
      canvas: [{ type: "rect", x: 0, y: 0, w: 842, h: 595, color: GRAPHITE }],
    }),
    footer: (page, count) => ({
      columns: [
        { text: input.surveyTitle, color: "#BDBDBD", margin: [34, 0, 0, 0] },
        {
          text: `Page ${page} of ${count}`,
          color: "#BDBDBD",
          alignment: "right",
          margin: [0, 0, 34, 0],
        },
      ],
      fontSize: 8,
    }),
    content,
  };
}

function header(input: PdfReportInput): ContentStack {
  const f = input.snapshot.funnel;
  return {
    stack: [
      { text: input.surveyTitle, fontSize: 24, bold: true, color: YELLOW },
      {
        text: `Survey period: ${formatDate(input.launchedAt)} – ${formatDate(input.snapshot.dataCutoffAt)}`,
        color: "#CFCFCF",
        margin: [0, 5, 0, 12],
      },
      {
        columns: [
          metric("Total respondents", f.identified),
          metric("Completed responses", f.completed),
          metric("Questions in survey", input.snapshot.questions.length),
        ],
        columnGap: 12,
        margin: [0, 0, 0, 18],
      },
    ],
  };
}

function metric(label: string, value: number): ContentStack {
  return {
    width: "*",
    stack: [
      { text: String(value), fontSize: 18, bold: true, color: YELLOW },
      { text: label, color: "#BDBDBD", fontSize: 8 },
    ],
    margin: [10, 8, 10, 8],
  } as ContentStack;
}

function questionCard(question: QuestionResult): Content {
  const values =
    question.type === "FREE_TEXT"
      ? (question.freeTextGroups ?? [])
      : (question.options ?? []);
  const max = Math.max(1, ...values.map((value) => value.count));
  return {
    width: "*",
    stack: [
      { text: `Q${question.position}`, color: YELLOW, bold: true, fontSize: 8 },
      { text: question.prompt, bold: true, fontSize: 11, margin: [0, 2, 0, 3] },
      {
        text: `Respondents: ${question.denominator}`,
        color: "#BDBDBD",
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      ...values.map(
        (value) =>
          ({
            columns: [
              {
                text: value.label,
                width: "42%",
                fontSize: 8,
                color: LIGHT,
                margin: [0, 2, 5, 2],
              },
              {
                width: "58%",
                stack: [
                  {
                    canvas: [
                      {
                        type: "rect",
                        x: 0,
                        y: 2,
                        w: Math.max(1, (value.count / max) * 135),
                        h: 8,
                        color: value.leader ? YELLOW : MID,
                      },
                    ],
                  },
                  {
                    text: `${value.count} (${formatPercent(value.percentage)}%)`,
                    bold: value.leader,
                    color: value.leader ? YELLOW : LIGHT,
                    fontSize: 8,
                    margin: [0, 1, 0, 2],
                  },
                ],
              },
            ],
            columnGap: 4,
          }) as Content,
      ),
      ...(values.length
        ? []
        : ([
            { text: "No responses", color: "#BDBDBD", italics: true },
          ] as Content[])),
    ],
    margin: [10, 9, 10, 9],
  } as Content;
}

export function paginateQuestions(questions: QuestionResult[]) {
  const pages: QuestionResult[][] = [];
  let current: QuestionResult[] = [];
  let weight = 0;
  for (const question of questions) {
    const values =
      question.type === "FREE_TEXT"
        ? (question.freeTextGroups ?? [])
        : (question.options ?? []);
    const itemWeight =
      question.prompt.length > 140 ||
      values.length > 7 ||
      values.some((v) => v.label.length > 55)
        ? 2
        : 1;
    if (current.length >= 4 || weight + itemWeight > 4) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(question);
    weight += itemWeight;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not available";
}
function formatPercent(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
