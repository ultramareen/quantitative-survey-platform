import "server-only";

import { randomBytes } from "node:crypto";
import { AppError } from "@/server/errors/app-error";
import {
  requireAuthenticated,
  requireSurveyOwner,
  requireSurveyTombstone,
} from "@/server/modules/auth/policies";
import type { EmployeePrincipal } from "@/types/employee";
import {
  QUESTION_TYPES,
  type SurveyDraftInput,
  type SurveyStatus,
} from "@/types/survey";
import type { SurveyRepository } from "./repository";

export class SurveyService {
  constructor(private readonly repository: SurveyRepository) {}

  list(actor: EmployeePrincipal | null) {
    requireAuthenticated(actor);
    return this.repository.list();
  }

  async view(actor: EmployeePrincipal | null, surveyId: string) {
    requireAuthenticated(actor);
    const survey = await this.repository.find(surveyId);
    if (!survey) throw notFound();
    return survey;
  }

  create(actor: EmployeePrincipal | null, input: SurveyDraftInput) {
    const employee = requireAuthenticated(actor);
    return this.repository.create(
      employee.id,
      normalizeDraft(input),
      publicId(),
    );
  }

  async update(
    actor: EmployeePrincipal | null,
    surveyId: string,
    input: SurveyDraftInput,
  ) {
    const employee = requireAuthenticated(actor);
    const survey = await this.repository.find(surveyId);
    if (!survey) throw notFound();
    if (employee.role !== "ADMIN" && employee.id !== survey.ownerId)
      throw new AppError({
        category: "AUTHORIZATION",
        code: "FORBIDDEN",
        message: "Draft ownership or Admin role is required.",
        safeMessage: "Access is denied.",
        status: 403,
      });
    if (survey.status !== "DRAFT")
      throw conflict("An activated questionnaire cannot be edited.");
    return this.repository.update(surveyId, employee.id, normalizeDraft(input));
  }

  async duplicate(actor: EmployeePrincipal | null, surveyId: string) {
    const employee = requireAuthenticated(actor);
    const survey = await this.repository.find(surveyId);
    if (!survey) throw notFound();
    return this.repository.duplicate(surveyId, employee.id, publicId());
  }

  async transition(
    actor: EmployeePrincipal | null,
    surveyId: string,
    target: SurveyStatus,
    stateVersion: number,
  ) {
    const survey = await this.repository.find(surveyId);
    if (!survey) throw notFound();
    requireSurveyOwner(actor, survey.ownerId);
    const allowed =
      (survey.status === "DRAFT" && target === "ACTIVE") ||
      (survey.status === "ACTIVE" &&
        (target === "PENDING_CAPACITY" || target === "COMPLETED")) ||
      (survey.status === "PENDING_CAPACITY" &&
        (target === "ACTIVE" || target === "COMPLETED"));
    if (!allowed)
      throw conflict("That survey status transition is not allowed.");
    if (!Number.isInteger(stateVersion) || stateVersion < 1)
      throw bad("A valid survey version is required.");
    if (target === "ACTIVE") validateActivation(survey.questions);
    return this.repository.transition({
      surveyId,
      actorId: requireAuthenticated(actor).id,
      from: survey.status,
      target,
      stateVersion,
    });
  }

  async remove(actor: EmployeePrincipal | null, surveyId: string) {
    const admin = requireSurveyTombstone(actor);
    const survey = await this.repository.find(surveyId);
    if (!survey) throw notFound();
    return this.repository.remove(surveyId, admin.id);
  }
}

export function normalizeDraft(input: SurveyDraftInput): SurveyDraftInput {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title || title.length > 300)
    throw bad("Survey title must be between 1 and 300 characters.");
  if (description && description.length > 4000)
    throw bad("Survey description cannot exceed 4000 characters.");
  if (!Array.isArray(input.questions) || input.questions.length > 50)
    throw bad("A survey can contain at most 50 questions.");
  const questionIds = new Set(input.questions.map((question) => question.id));
  if (questionIds.size !== input.questions.length)
    throw bad("Question IDs must be unique.");
  const positions = new Map(
    input.questions.map((question, index) => [question.id, index]),
  );
  return {
    title,
    description,
    questions: input.questions.map((question, index) => {
      const prompt = question.prompt.trim();
      if (!prompt || prompt.length > 4000)
        throw bad(
          `Question ${index + 1} must have text of at most 4000 characters.`,
        );
      if (!QUESTION_TYPES.includes(question.type))
        throw bad(`Question ${index + 1} has an unsupported type.`);
      if (typeof question.required !== "boolean")
        throw bad(`Question ${index + 1} must be marked Required or Optional.`);
      if (!Array.isArray(question.options) || question.options.length > 11)
        throw bad(
          `Question ${index + 1} can contain at most 11 answer options.`,
        );
      const optionIds = new Set(question.options.map((option) => option.id));
      if (optionIds.size !== question.options.length)
        throw bad(`Answer option IDs in question ${index + 1} must be unique.`);
      const options = question.options.map((value, optionIndex) => {
        const label = value.label.trim();
        if (!label || label.length > 1000)
          throw bad(
            `Option ${optionIndex + 1} in question ${index + 1} is invalid.`,
          );
        if (
          question.type !== "SINGLE_CHOICE" &&
          value.destination.type !== "NEXT"
        )
          throw bad(`Only single-choice question ${index + 1} can branch.`);
        if (value.destination.type === "QUESTION") {
          const target = positions.get(value.destination.questionId);
          if (target === undefined)
            throw bad(
              `Branch in question ${index + 1} references a missing question.`,
            );
          if (target <= index)
            throw bad(
              `Branch in question ${index + 1} must point to a later question.`,
            );
        }
        return { id: value.id, label, destination: value.destination };
      });
      if (question.type === "FREE_TEXT" && options.length !== 0)
        throw bad(
          `Free-text question ${index + 1} cannot have answer options.`,
        );
      return {
        id: question.id,
        prompt,
        type: question.type,
        required: question.required,
        options,
      };
    }),
  };
}

export function validateActivation(questions: SurveyDraftInput["questions"]) {
  if (questions.length < 1 || questions.length > 50)
    throw bad("Activation requires between 1 and 50 questions.");
  questions.forEach((question, index) => {
    if (question.type === "FREE_TEXT" && question.options.length !== 0)
      throw bad(`Free-text question ${index + 1} cannot have answer options.`);
    if (
      question.type !== "FREE_TEXT" &&
      (question.options.length < 2 || question.options.length > 11)
    )
      throw bad(
        `Choice question ${index + 1} requires between 2 and 11 answer options.`,
      );
  });
}

function publicId() {
  return randomBytes(16).toString("base64url");
}
function bad(message: string) {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_SURVEY",
    message,
    safeMessage: message,
    status: 400,
  });
}
function conflict(message: string) {
  return new AppError({
    category: "CONFLICT",
    code: "SURVEY_CONFLICT",
    message,
    safeMessage: message,
    status: 409,
  });
}
function notFound() {
  return new AppError({
    category: "NOT_FOUND",
    code: "SURVEY_NOT_FOUND",
    message: "Survey not found.",
    safeMessage: "Survey not found.",
    status: 404,
  });
}
