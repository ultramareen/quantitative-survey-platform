export type PublicSurveyAvailability = "ACTIVE" | "PENDING" | "UNAVAILABLE";

export type PublicSurveyOpenResult = {
  availability: PublicSurveyAvailability;
  title?: string;
  description?: string | null;
  identified: boolean;
  newOpenToken?: string;
};

export type PublicIdentityInput = {
  name: string;
  phone: string;
  country: string;
};

export type PublicIdentityResult = {
  identified: true;
  newAttemptToken?: string;
};

export type PublicAnswerValue = number | number[] | string | null;
export type PublicQuestion = {
  position: number;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FREE_TEXT";
  prompt: string;
  required: boolean;
  options: { position: number; label: string }[];
};
export type PublicAttemptState = {
  title: string;
  description?: string | null;
  generation: number;
  revision: number;
  answers: Record<string, Exclude<PublicAnswerValue, null>>;
  questions: PublicQuestion[];
  conflict?: true;
};
export type PublicAnswerMutation = {
  questionPosition: number;
  value: PublicAnswerValue;
  generation: number;
  baseRevision: number;
  mutationId: string;
};
