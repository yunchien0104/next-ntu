import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_COOKIE,
  CalendarServerError,
  calendarErrorResponse,
  exchangeGoogleCode,
  getCalendarAdmin,
  getGoogleAccount,
  getGoogleConfig,
  getOAuthBrowserSecret,
  hashOAuthSecret,
  saveGoogleConnection,
} from "@/lib/google/calendar/calendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthState {
  user_id: string;
  code_verifier: string;
}

function returnToApp(
  origin: string,
  secureCookie: boolean,
  result: "connected" | "cancelled" | "error",
  message?: string
) {
  const url = new URL("/", origin);

  url.searchParams.set(
    "googleCalendar",
    result
  );

  if (message) {
    url.searchParams.set(
      "googleCalendarMessage",
      message
    );
  }

  const response = NextResponse.redirect(
    url,
    303
  );

  response.headers.set(
    "Cache-Control",
    "no-store"
  );

  response.headers.set(
    "Referrer-Policy",
    "no-referrer"
  );

  // 本次流程已結束，移除暫存 Cookie。
  response.cookies.set(
    GOOGLE_OAUTH_COOKIE,
    "",
    {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/api/google/calendar",
      maxAge: 0,
    }
  );

  return response;
}

export async function GET(request: Request) {
  let appOrigin: string | null = null;
  let secureCookie = false;

  try {
    const config = getGoogleConfig();

    appOrigin = config.origin;
    secureCookie = config.secureCookie;

    const url = new URL(request.url);

    const state =
      url.searchParams.get("state");

    const code =
      url.searchParams.get("code");

    const googleError =
      url.searchParams.get("error");

    const browserSecret =
      await getOAuthBrowserSecret();

    if (
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !browserSecret ||
      !/^[A-Za-z0-9_-]{43}$/.test(
        browserSecret
      )
    ) {
      throw new CalendarServerError(
        "授權流程已失效，請重新連接 Google 日曆",
        400
      );
    }

    const admin = getCalendarAdmin();

    // 一次性取出並刪除流程資料，避免重複使用。
    // 同時確認瀏覽器、回呼網址及有效期限。
    const { data, error } = await admin
      .from("google_calendar_oauth_states")
      .delete()
      .eq(
        "state_hash",
        hashOAuthSecret(state)
      )
      .eq(
        "browser_hash",
        hashOAuthSecret(browserSecret)
      )
      .eq(
        "redirect_uri",
        config.redirectUri
      )
      .gt(
        "expires_at",
        new Date().toISOString()
      )
      .select("user_id,code_verifier")
      .maybeSingle();

    if (error) {
      throw new CalendarServerError(
        "無法確認授權流程，請重新連接",
        503
      );
    }

    if (!data) {
      throw new CalendarServerError(
        "授權流程已過期或已使用，請重新連接",
        400
      );
    }

    const flow = data as OAuthState;

    if (googleError === "access_denied") {
      return returnToApp(
        appOrigin,
        secureCookie,
        "cancelled",
        "你已取消 Google 日曆授權"
      );
    }

    if (googleError) {
      throw new CalendarServerError(
        "Google 授權未完成，請重新連接",
        400
      );
    }

    if (!code || code.length > 4096) {
      throw new CalendarServerError(
        "未收到有效的 Google 授權碼",
        400
      );
    }

    // 在伺服器交換憑證，不把憑證傳給瀏覽器。
    const { tokens, scopes } =
      await exchangeGoogleCode(
        code,
        flow.code_verifier
      );

    // 使用 Google 回傳的身分確認實際授權帳號。
    const account = await getGoogleAccount(
      tokens.accessToken
    );

    // 將選擇的 Google 帳號與開始授權的
    // Next@NTU 使用者綁定，憑證加密後保存。
    await saveGoogleConnection(
      flow.user_id,
      account,
      tokens,
      scopes
    );

    return returnToApp(
      appOrigin,
      secureCookie,
      "connected"
    );
  } catch (error) {
    if (!appOrigin) {
      return calendarErrorResponse(error);
    }

    const message =
      error instanceof CalendarServerError
        ? error.message
        : "Google 日曆連接失敗，請重新操作";

    return returnToApp(
      appOrigin,
      secureCookie,
      "error",
      message
    );
  }
}