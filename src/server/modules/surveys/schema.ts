import "server-only";

import { z } from "zod";

export const questionSchema = z
  .object({
    id: z.string().uuid(),
    prompt: z.string(),
    type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "FREE_TEXT"]),
    required: z.boolean(),
    options: z.array(
      z
        .object({
          id: z.string().uuid(),
          label: z.string(),
          destination: z.discriminatedUnion("type", [
            z.object({ type: z.literal("NEXT") }).strict(),
            z.object({ type: z.literal("END") }).strict(),
            z
              .object({
                type: z.literal("QUESTION"),
                questionId: z.string().uuid(),
              })
              .strict(),
          ]),
        })
        .strict(),
    ),
  })
  .strict();

export const surveySchema = z
  .object({
    title: z.string(),
    description: z.string().nullable().optional(),
    questions: z.array(questionSchema),
  })
  .strict();
