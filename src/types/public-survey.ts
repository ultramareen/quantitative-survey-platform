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
