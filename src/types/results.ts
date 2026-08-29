export type FunnelResult = {
  opened: number;
  identified: number;
  currentAttempts: number;
  started: number;
  startedPercentage: number;
  greaterThanHalf: number;
  greaterThanHalfPercentage: number;
  completed: number;
  completedPercentage: number;
};
export type ChoiceResult = {
  position: number;
  label: string;
  count: number;
  percentage: number;
  leader: boolean;
};
export type QuestionResult = {
  position: number;
  prompt: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FREE_TEXT";
  denominator: number;
  options?: ChoiceResult[];
  freeTextGroups?: {
    label: string;
    count: number;
    percentage: number;
    leader: boolean;
  }[];
  uniqueGroupCount?: number;
  truncated?: boolean;
};
export type ResultsSnapshotDto = {
  snapshotNumber: number;
  dataCutoffAt: string;
  createdAt: string;
  funnel: FunnelResult;
  questions: QuestionResult[];
};
