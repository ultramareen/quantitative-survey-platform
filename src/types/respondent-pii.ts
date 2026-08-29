export type RespondentAccessState = "EDITABLE" | "LOCKED";

export type RespondentPiiDto = {
  referenceId: string;
  name: string;
  phone: string;
  survey: {
    id: string;
    title: string;
    status: "ACTIVE" | "PENDING_CAPACITY" | "COMPLETED";
  };
  coverage: {
    answeredQuestions: number;
    totalQuestions: number;
    percentage: number;
  };
  startedAt: string | null;
  lastAnswerChangedAt: string | null;
  identifiedAt: string;
  lastActivityAt: string;
  state: RespondentAccessState;
};

export type RespondentPiiListDto = {
  respondents: RespondentPiiDto[];
  total: number;
  page: number;
  pageSize: number;
};
