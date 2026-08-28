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

export type SurveyQuestionInput = {
  prompt: string;
  type: QuestionType;
  required: boolean;
  options: string[];
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
  questions: Array<SurveyQuestionInput & { id: string; position: number }>;
};
