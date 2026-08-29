export type ExportKind = "aggregate" | "current" | "archived" | "free-text";

export type ExportRequest = {
  kind: ExportKind;
  snapshotNumber?: number;
  questionPosition?: number;
  part: number;
};

export type ExportResult = {
  stream: NodeJS.ReadableStream;
  filename: string;
  exportedAt: string;
  sourceAt: string;
  part: number;
  totalParts: number;
  rowCount: number;
};
