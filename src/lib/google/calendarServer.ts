import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { cookies } from "next/headers";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const GOOGLE_OAUTH_COOKIE =
  "next-ntu-google-calendar-oauth";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  GOOGLE_CALENDAR_SCOPE,
];

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface GoogleConnection {
  user_id: string;
  connection_id: string;
  google_subject: string;
  google_email: string;
  tokens_encrypted: string;
  granted_scopes: string[];
  created_at: string;
  updated_at: string;
}

export class CalendarServerError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "CalendarServerError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CalendarServerError(
      `伺服器缺少環境變數：${name}`
    );
  }

  return value;
}

export function getGoogleConfig() {
  const redirectUri = requiredEnv(
    "GOOGLE_CALENDAR_REDIRECT_URI"
  );

  const url = new URL(redirectUri);

  const localHttp =
    url.protocol === "http:" &&
    url.hostname === "localhost";

  if (
    url.protocol !== "https:" &&
    !localHttp
  ) {
    throw new CalendarServerError(
      "Google 回呼網址必須使用 HTTPS，或 localhost"
    );
  }

  if (
    url.pathname !==
      "/api/google/calendar/callback" ||
    url.search ||
    url.hash
  ) {
    throw new CalendarServerError(
      "Google 回呼網址設定不正確"
    );
  }

  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv(
      "GOOGLE_CLIENT_SECRET"
    ),
    redirectUri,
    origin: url.origin,
    secureCookie: url.protocol === "https:",
  };
}

export function getCalendarAdmin(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

// 讀取任務時使用使用者本人的權限，保留原有 RLS。
export function getCalendarUserClient(
  accessToken: string
): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

// 向 Supabase 驗證 JWT，不相信前端自行提供的 userId。
export async function requireCalendarUser(
  request: Request
) {
  const authorization =
    request.headers.get("authorization") ?? "";

  const match = authorization.match(
    /^Bearer\s+(\S+)$/i
  );

  if (!match) {
    throw new CalendarServerError(
      "請先登入 Next@NTU",
      401
    );
  }

  const accessToken = match[1];
  const admin = getCalendarAdmin();

  const { data, error } =
    await admin.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new CalendarServerError(
      "登入已失效，請重新登入",
      401
    );
  }

  return {
    user: data.user,
    accessToken,
  };
}

// 修改資料的 API 只接受從本站送出的請求。
export function requireCalendarOrigin(
  request: Request
) {
  const { origin } = getGoogleConfig();

  if (request.headers.get("origin") !== origin) {
    throw new CalendarServerError(
      "請從 Next@NTU 網站操作",
      403
    );
  }
}

export function randomOAuthSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthSecret(
  value: string
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export async function getOAuthBrowserSecret() {
  const cookieStore = await cookies();

  return cookieStore.get(
    GOOGLE_OAUTH_COOKIE
  )?.value;
}

// 每次連接都讓使用者選擇 Google 帳號並確認授權。
export function buildGoogleAuthorizationUrl(
  state: string,
  codeVerifier: string
): string {
  const config = getGoogleConfig();

  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "select_account consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    params.toString()
  );
}

async function requestGoogleTokens(
  params: URLSearchParams
): Promise<GoogleTokenResponse> {
  let response: Response;

  try {
    response = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    throw new CalendarServerError(
      "無法連線到 Google，請稍後再試",
      502
    );
  }

  const data = (await response
    .json()
    .catch(() => null)) as
    | GoogleTokenResponse
    | null;

  if (!response.ok) {
    if (data?.error === "invalid_grant") {
      throw new CalendarServerError(
        "Google 授權已失效，請重新連接日曆",
        409
      );
    }

    throw new CalendarServerError(
      "Google 授權失敗，請檢查設定或重新連接",
      502
    );
  }

  if (
    !data ||
    typeof data.access_token !== "string" ||
    !data.access_token ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    throw new CalendarServerError(
      "Google 回傳的授權資料不完整",
      502
    );
  }

  return data;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string
) {
  const config = getGoogleConfig();

  const data = await requestGoogleTokens(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    })
  );

  const scopes = (data.scope ?? "")
    .split(/\s+/)
    .filter(Boolean);

  if (!scopes.includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new CalendarServerError(
      "尚未授予日曆權限，請重新連接並允許日曆存取",
      403
    );
  }

  if (
    typeof data.refresh_token !== "string" ||
    !data.refresh_token
  ) {
    throw new CalendarServerError(
      "未取得持續授權，請重新連接 Google 日曆",
      409
    );
  }

  const tokens: GoogleTokens = {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    expiresAt:
      Date.now() + data.expires_in! * 1000,
  };

  return { tokens, scopes };
}

export async function getGoogleAccount(
  accessToken: string
): Promise<{
  subject: string;
  email: string;
}> {
  let response: Response;

  try {
    response = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    throw new CalendarServerError(
      "無法確認 Google 帳號，請稍後重試",
      502
    );
  }

  const data = (await response
    .json()
    .catch(() => null)) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  } | null;

  if (
    !response.ok ||
    typeof data?.sub !== "string" ||
    !data.sub ||
    typeof data.email !== "string" ||
    !data.email ||
    data.email_verified !== true
  ) {
    throw new CalendarServerError(
      "無法取得已驗證的 Google 帳號",
      502
    );
  }

  return {
    subject: data.sub,
    email: data.email,
  };
}

function encryptionKey(): Buffer {
  const value = requiredEnv(
    "GOOGLE_CALENDAR_ENCRYPTION_KEY"
  );

  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new CalendarServerError(
      "加密金鑰必須是 64 個十六進位字元"
    );
  }

  return Buffer.from(value, "hex");
}

function encryptTokens(
  tokens: GoogleTokens,
  userId: string
): string {
  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKey(),
    iv
  );

  // 將憑證綁定到所屬 Next@NTU 使用者。
  cipher.setAAD(Buffer.from(userId, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify(tokens),
      "utf8"
    ),
    cipher.final(),
  ]);

  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptTokens(
  encrypted: string,
  userId: string
): GoogleTokens {
  const key = encryptionKey();

  try {
    const parts = encrypted.split(".");

    if (
      parts.length !== 4 ||
      parts[0] !== "v1"
    ) {
      throw new Error("Invalid token format");
    }

    const iv = Buffer.from(
      parts[1],
      "base64url"
    );

    const tag = Buffer.from(
      parts[2],
      "base64url"
    );

    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error("Invalid encryption data");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      iv
    );

    decipher.setAAD(
      Buffer.from(userId, "utf8")
    );

    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(
        Buffer.from(parts[3], "base64url")
      ),
      decipher.final(),
    ]).toString("utf8");

    const tokens = JSON.parse(
      plaintext
    ) as GoogleTokens;

    if (
      typeof tokens.accessToken !== "string" ||
      !tokens.accessToken ||
      typeof tokens.refreshToken !== "string" ||
      !tokens.refreshToken ||
      typeof tokens.expiresAt !== "number" ||
      !Number.isFinite(tokens.expiresAt)
    ) {
      throw new Error("Invalid token contents");
    }

    return tokens;
  } catch {
    throw new CalendarServerError(
      "無法讀取 Google 授權，請重新連接日曆",
      409
    );
  }
}

export async function readGoogleConnection(
  userId: string
): Promise<GoogleConnection | null> {
  const { data, error } = await getCalendarAdmin()
    .from("google_calendar_connections")
    .select(
      "user_id,connection_id,google_subject," +
        "google_email,tokens_encrypted," +
        "granted_scopes,created_at,updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new CalendarServerError(
      "無法讀取 Google 日曆連接資料",
      503
    );
  }

  return data as GoogleConnection | null;
}

export async function saveGoogleConnection(
  userId: string,
  account: {
    subject: string;
    email: string;
  },
  tokens: GoogleTokens,
  scopes: string[]
) {
  const now = new Date().toISOString();

  const { error } = await getCalendarAdmin()
    .from("google_calendar_connections")
    .upsert(
      {
        user_id: userId,
        connection_id: randomUUID(),
        google_subject: account.subject,
        google_email: account.email,
        tokens_encrypted: encryptTokens(
          tokens,
          userId
        ),
        granted_scopes: scopes,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw new CalendarServerError(
      "Google 授權保存失敗，請重新連接",
      503
    );
  }
}

// 即將到期時，以 refresh token 更新授權。
export async function getGoogleAccessToken(
  userId: string
) {
  const connection =
    await readGoogleConnection(userId);

  if (!connection) {
    throw new CalendarServerError(
      "請先連接 Google 日曆",
      409
    );
  }

  if (
    !connection.granted_scopes.includes(
      GOOGLE_CALENDAR_SCOPE
    )
  ) {
    throw new CalendarServerError(
      "Google 日曆權限不足，請重新連接",
      403
    );
  }

  const tokens = decryptTokens(
    connection.tokens_encrypted,
    userId
  );

  if (tokens.expiresAt > Date.now() + 60_000) {
    return {
      accessToken: tokens.accessToken,
      connection,
    };
  }

  const config = getGoogleConfig();

  const refreshed = await requestGoogleTokens(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    })
  );

  const nextTokens: GoogleTokens = {
    accessToken: refreshed.access_token!,
    refreshToken:
      refreshed.refresh_token ||
      tokens.refreshToken,
    expiresAt:
      Date.now() +
      refreshed.expires_in! * 1000,
  };

  const { data, error } = await getCalendarAdmin()
    .from("google_calendar_connections")
    .update({
      tokens_encrypted: encryptTokens(
        nextTokens,
        userId
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq(
      "connection_id",
      connection.connection_id
    )
    .select("connection_id")
    .maybeSingle();

  if (error) {
    throw new CalendarServerError(
      "無法更新 Google 授權，請稍後重試",
      503
    );
  }

  if (!data) {
    throw new CalendarServerError(
      "Google 連接已變更，請重新操作",
      409
    );
  }

  return {
    accessToken: nextTokens.accessToken,
    connection,
  };
}

// API 使用統一錯誤格式，避免傳出憑證內容。
export function calendarErrorResponse(
  error: unknown
): Response {
  const known =
    error instanceof CalendarServerError;

  return Response.json(
    {
      error: known
        ? error.message
        : "Google 日曆操作失敗，請稍後重試",
    },
    {
      status: known ? error.status : 500,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}