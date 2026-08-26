import "server-only";

import type { z } from "zod";

import { AppError } from "@/server/errors/app-error";

export async function parseJsonRequest<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let input: unknown;

  try {
    input = await request.json();
  } catch (cause) {
    throw new AppError({
      category: "VALIDATION",
      code: "INVALID_JSON",
      message: "Request body was not valid JSON.",
      safeMessage: "The request body must be valid JSON.",
      status: 400,
      cause,
    });
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError({
      category: "VALIDATION",
      code: "INVALID_REQUEST",
      message: "Request body failed schema validation.",
      safeMessage: "The request contains invalid fields.",
      status: 400,
    });
  }

  return result.data;
}
