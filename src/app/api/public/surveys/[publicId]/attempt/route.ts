import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnvironment } from "@/server/config/env";
import { assertTrustedMutationOrigin } from "@/server/http/csrf";
import { getPublicAttemptService } from "@/server/modules/attempts/runtime";
import { attemptCookieName } from "@/server/modules/respondents/constants";
import { publicError } from "@/server/modules/respondents/http";

const mutationSchema = z
  .object({
    questionPosition: z.number().int().min(1).max(50),
    value: z.union([
      z.number().int(),
      z.array(z.number().int()).max(11),
      z.string().max(10_000),
      z.null(),
    ]),
    generation: z.number().int().positive(),
    baseRevision: z.number().int().nonnegative(),
    mutationId: z.string().uuid(),
  })
  .strict();
const submitSchema = z
  .object({
    generation: z.number().int().positive(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await context.params;
    const state = await getPublicAttemptService().load(
      publicId,
      request.cookies.get(attemptCookieName(publicId))?.value,
    );
    return NextResponse.json(state, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    assertTrustedMutationOrigin(request, getServerEnvironment().APP_ORIGIN);
    if (Number(request.headers.get("content-length") ?? 0) > 16_384)
      return NextResponse.json(
        { message: "The request is too large." },
        { status: 413 },
      );
    const body = mutationSchema.parse(await request.json());
    const { publicId } = await context.params;
    const state = await getPublicAttemptService().mutate(
      publicId,
      request.cookies.get(attemptCookieName(publicId))?.value,
      body,
    );
    return NextResponse.json(state, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    assertTrustedMutationOrigin(request, getServerEnvironment().APP_ORIGIN);
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      return NextResponse.json(
        { message: "The request is too large." },
        { status: 413 },
      );
    const body = submitSchema.parse(await request.json());
    const { publicId } = await context.params;
    const result = await getPublicAttemptService().submit(
      publicId,
      request.cookies.get(attemptCookieName(publicId))?.value,
      body,
    );
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return publicError(error);
  }
}
