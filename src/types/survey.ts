export const SURVEY_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "PENDING_CAPACITY",
  "COMPLETED",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "FREE_TEXT",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type BranchDestination =
  { type: "NEXT" } | { type: "QUESTION"; questionId: string } | { type: "END" };

export type SurveyOptionInput = {
  id: string;
  label: string;
  destination: BranchDestination;
};

export type SurveyQuestionInput = {
  id: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  options: SurveyOptionInput[];
};

export type SurveyDraftInput = {
  title: string;
  description?: string | null;
  questions: SurveyQuestionInput[];
};

export type SurveySummary = {
  id: string;
  publicId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  pauseReason: "MANUAL" | "INFRASTRUCTURE_CAPACITY" | null;
  stateVersion: number;
  questionCount: number;
  createdAt: Date;
  updatedAt: Date;
  launchedAt: Date | null;
  pausedAt: Date | null;
  completedAt: Date | null;
};

export type SurveyDetail = SurveySummary & {
  questions: Array<SurveyQuestionInput & { position: number }>;
};
