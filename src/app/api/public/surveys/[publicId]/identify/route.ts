import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnvironment } from "@/server/config/env";
import { secureCookieOptions } from "@/server/http/cookies";
import { assertTrustedMutationOrigin } from "@/server/http/csrf";
import {
  publicError,
  publicRateSubject,
} from "@/server/modules/respondents/http";
import { getPublicRespondentService } from "@/server/modules/respondents/runtime";
import {
  attemptCookieName,
  openCookieName,
  PUBLIC_COOKIE_MAX_AGE_SECONDS,
} from "@/server/modules/respondents/constants";
const schema = z
  .object({
    name: z.string().max(200),
    phone: z.string().max(64),
    country: z.string().length(2),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    assertTrustedMutationOrigin(request, getServerEnvironment().APP_ORIGIN);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 4096)
      return NextResponse.json(
        { message: "The request is too large." },
        { status: 413 },
      );
    const body = schema.parse(await request.json());
    const { publicId } = await context.params;
    const result = await getPublicRespondentService().identify(
      publicId,
      request.cookies.get(openCookieName(publicId))?.value,
      body,
      publicRateSubject(request),
    );
    const response = NextResponse.json(
      { identified: true },
      { headers: { "cache-control": "private, no-store" } },
    );
    if (result.newAttemptToken)
      response.cookies.set(
        attemptCookieName(publicId),
        result.newAttemptToken,
        {
          ...secureCookieOptions(getServerEnvironment().APP_ENV),
          maxAge: PUBLIC_COOKIE_MAX_AGE_SECONDS,
        },
      );
    return response;
  } catch (error) {
    return publicError(error);
  }
}
