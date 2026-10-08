import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_COOKIE,
  buildGoogleAuthorizationUrl,
  calendarErrorResponse,
  CalendarServerError,
  getCalendarAdmin,
  getGoogleConfig,
  hashOAuthSecret,
  randomOAuthSecret,
  requireCalendarOrigin,
  requireCalendarUser,
} from "@/lib/google/calendar/calendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 只接受從本站送出的請求。
    requireCalendarOrigin(request);

    // 由 Supabase 驗證目前登入的使用者。
    const { user } =
      await requireCalendarUser(request);

    const config = getGoogleConfig();
    const admin = getCalendarAdmin();

    const state = randomOAuthSecret();
    const browserSecret = randomOAuthSecret();
    const codeVerifier = randomOAuthSecret();

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    // 清理這位使用者已過期的授權流程。
    const { error: cleanupError } = await admin
      .from("google_calendar_oauth_states")
      .delete()
      .eq("user_id", user.id)
      .lt(
        "expires_at",
        new Date().toISOString()
      );

    if (cleanupError) {
      throw new CalendarServerError(
        "無法準備 Google 授權，請稍後重試",
        503
      );
    }

    // 將本次授權綁定到 Next@NTU 使用者及瀏覽器。
    const { error } = await admin
      .from("google_calendar_oauth_states")
      .insert({
        state_hash: hashOAuthSecret(state),
        user_id: user.id,
        browser_hash:
          hashOAuthSecret(browserSecret),
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
        expires_at: expiresAt,
      });

    if (error) {
      throw new CalendarServerError(
        "無法建立 Google 授權流程，請稍後重試",
        503
      );
    }

    const url = buildGoogleAuthorizationUrl(
      state,
      codeVerifier
    );

    const response = NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );

    // 回呼時用這個 Cookie 確认是同一個瀏覽器。
    // HttpOnly：前端 JavaScript 無法讀取。
    response.cookies.set(
      GOOGLE_OAUTH_COOKIE,
      browserSecret,
      {
        httpOnly: true,
        secure: config.secureCookie,
        sameSite: "lax",
        path: "/api/google/calendar",
        maxAge: 10 * 60,
      }
    );

    return response;
  } catch (error) {
    return calendarErrorResponse(error);
  }
}