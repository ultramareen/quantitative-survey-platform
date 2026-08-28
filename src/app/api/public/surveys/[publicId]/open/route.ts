import { NextResponse, type NextRequest } from "next/server";
import { secureCookieOptions } from "@/server/http/cookies";
import { getServerEnvironment } from "@/server/config/env";
import {
  publicError,
  publicRateSubject,
} from "@/server/modules/respondents/http";
import { getPublicRespondentService } from "@/server/modules/respondents/runtime";
import {
  openCookieName,
  PUBLIC_COOKIE_MAX_AGE_SECONDS,
} from "@/server/modules/respondents/constants";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await context.params;
    const cookieName = openCookieName(publicId);
    const result = await getPublicRespondentService().open(
      publicId,
      request.cookies.get(cookieName)?.value,
      publicRateSubject(request),
    );
    const { newOpenToken, ...publicResult } = result;
    const response = NextResponse.json(publicResult, {
      headers: { "cache-control": "private, no-store" },
    });
    if (newOpenToken) {
      response.cookies.set(cookieName, newOpenToken, {
        ...secureCookieOptions(getServerEnvironment().APP_ENV),
        maxAge: PUBLIC_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    return publicError(error);
  }
}
