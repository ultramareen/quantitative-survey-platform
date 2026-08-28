import "server-only";

import { z } from "zod";

export const questionSchema = z
  .object({
    prompt: z.string(),
    type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "FREE_TEXT"]),
    required: z.boolean(),
    options: z.array(z.string()),
  })
  .strict();

export const surveySchema = z
  .object({
    title: z.string(),
    description: z.string().nullable().optional(),
    questions: z.array(questionSchema),
  })
  .strict();
