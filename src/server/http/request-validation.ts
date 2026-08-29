import "server-only";

import type { z } from "zod";

import { AppError } from "@/server/errors/app-error";

export async function parseJsonRequest<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  maximumBytes = 16_384,
): Promise<z.infer<TSchema>> {
  let input: unknown;

  try {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
      throw new Error("Invalid request-size limit.");
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maximumBytes) throw bodyTooLarge();
    if (!request.body) throw invalidJson();
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw bodyTooLarge();
      }
      chunks.push(value);
    }
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
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

function bodyTooLarge() {
  return new AppError({
    category: "VALIDATION",
    code: "REQUEST_BODY_TOO_LARGE",
    message: "Request body exceeded the configured limit.",
    safeMessage: "The request is too large.",
    status: 413,
  });
}

function invalidJson() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_JSON",
    message: "Request body was not valid JSON.",
    safeMessage: "The request body must be valid JSON.",
    status: 400,
  });
}
