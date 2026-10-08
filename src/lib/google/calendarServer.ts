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

interface GoogleAccount {
  subject: string;
  email: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

const CONNECTION_COLUMNS = [
  "user_id",
  "connection_id",
  "google_subject",
  "google_email",
  "tokens_encrypted",
  "granted_scopes",
  "created_at",
  "updated_at",
].join(",");

export class CalendarServerError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "CalendarServerError";
    this.status = status;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CalendarServerError(
      `伺服器缺少環境變數：${name}`,
      500
    );
  }

  return value;
}

export function getGoogleConfig() {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv(
    "GOOGLE_CLIENT_SECRET"
  );
  const redirectUri = requiredEnv(
    "GOOGLE_CALENDAR_REDIRECT_URI"
  );

  let redirectUrl: URL;

  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new CalendarServerError(
      "GOOGLE_CALENDAR_REDIRECT_URI 格式不正確。",
      500
    );
  }

  const isLocal =
    redirectUrl.protocol === "http:" &&
    redirectUrl.hostname === "localhost";

  if (
    (redirectUrl.protocol !== "https:" && !isLocal) ||
    redirectUrl.pathname !==
      "/api/google/calendar/callback" ||
    redirectUrl.search !== "" ||
    redirectUrl.hash !== "" ||
    redirectUrl.username !== "" ||
    redirectUrl.password !== ""
  ) {
    throw new CalendarServerError(
      "Google 回呼網址設定不正確，請檢查 GOOGLE_CALENDAR_REDIRECT_URI。",
      500
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    origin: redirectUrl.origin,
    secureCookie: redirectUrl.protocol === "https:",
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

export async function requireCalendarUser(
  request: Request
) {
  const authorization =
    request.headers.get("Authorization");

  const match = authorization?.match(
    /^Bearer\s+(\S+)$/i
  );

  if (!match) {
    throw new CalendarServerError(
      "請重新登入 Next@NTU。",
      401
    );
  }

  const accessToken = match[1];

  const { data, error } =
    await getCalendarAdmin().auth.getUser(
      accessToken
    );

  if (error || !data.user) {
    throw new CalendarServerError(
      "登入已失效，請重新登入 Next@NTU。",
      401
    );
  }

  return {
    user: data.user,
    accessToken,
  };
}

export function requireCalendarOrigin(
  request: Request
): void {
  const { origin } = getGoogleConfig();

  if (request.headers.get("Origin") !== origin) {
    throw new CalendarServerError(
      "請從 Next@NTU 網站操作。",
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

  return cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value;
}

export function buildGoogleAuthorizationUrl(
  state: string,
  codeVerifier: string
): string {
  const config = getGoogleConfig();

  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const url = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );

  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "select_account consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  return url.toString();
}

async function requestGoogleTokens(
  parameters: URLSearchParams
): Promise<GoogleTokenResponse> {
  let response: Response;
  let raw: unknown;

  try {
    response = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: parameters.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }
    );

    raw = await response.json();
  } catch {
    throw new CalendarServerError(
      "Google 授權服務暫時無法連線，請稍後重試。",
      502
    );
  }

  const result =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  if (!response.ok) {
    if (result?.error === "invalid_grant") {
      throw new CalendarServerError(
        "Google 授權已失效，請重新連接 Google 帳號。",
        409
      );
    }

    throw new CalendarServerError(
      "Google 授權失敗，請確認 OAuth 設定後重新連接。",
      502
    );
  }

  if (
    !result ||
    typeof result.access_token !== "string" ||
    !result.access_token ||
    typeof result.expires_in !== "number" ||
    !Number.isFinite(result.expires_in) ||
    result.expires_in <= 0 ||
    (result.refresh_token !== undefined &&
      typeof result.refresh_token !== "string") ||
    (result.scope !== undefined &&
      typeof result.scope !== "string")
  ) {
    throw new CalendarServerError(
      "Google 授權回應不完整，請重新連接。",
      502
    );
  }

  return {
    access_token: result.access_token,
    expires_in: result.expires_in,
    refresh_token: result.refresh_token as
      | string
      | undefined,
    scope: result.scope as string | undefined,
  };
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string
): Promise<{
  tokens: GoogleTokens;
  scopes: string[];
}> {
  const config = getGoogleConfig();

  const result = await requestGoogleTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: codeVerifier,
    })
  );

  const scopes =
    result.scope?.split(/\s+/).filter(Boolean) ?? [];

  if (!scopes.includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new CalendarServerError(
      "尚未取得 Google 日曆權限，請重新連接並允許日曆授權。",
      403
    );
  }

  if (!result.refresh_token) {
    throw new CalendarServerError(
      "未取得持續使用日曆所需的授權，請重新連接 Google 帳號。",
      409
    );
  }

  return {
    tokens: {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt:
        Date.now() + result.expires_in * 1000,
    },
    scopes,
  };
}

export async function getGoogleAccount(
  accessToken: string
): Promise<GoogleAccount> {
  let response: Response;
  let raw: unknown;

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

    raw = await response.json();
  } catch {
    throw new CalendarServerError(
      "無法取得 Google 帳號資料，請重新連接。",
      502
    );
  }

  const result =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  if (
    !response.ok ||
    !result ||
    typeof result.sub !== "string" ||
    !result.sub ||
    typeof result.email !== "string" ||
    !result.email ||
    result.email_verified !== true
  ) {
    throw new CalendarServerError(
      "無法確認 Google 帳號，請使用已驗證的 Google 帳號重新授權。",
      502
    );
  }

  return {
    subject: result.sub,
    email: result.email,
  };
}

function encryptionKey(): Buffer {
  const value = requiredEnv(
    "GOOGLE_CALENDAR_ENCRYPTION_KEY"
  );

  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new CalendarServerError(
      "GOOGLE_CALENDAR_ENCRYPTION_KEY 必須是 64 位十六進位字串。",
      500
    );
  }

  return Buffer.from(value, "hex");
}

export function encryptTokens(
  tokens: GoogleTokens,
  userId: string
): string {
  const key = encryptionKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    iv
  );

  cipher.setAAD(Buffer.from(userId, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify(tokens),
      "utf8"
    ),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTokens(
  encryptedValue: string,
  userId: string
): GoogleTokens {
  const key = encryptionKey();

  try {
    const parts = encryptedValue.split(".");

    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid encrypted format");
    }

    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(
      parts[3],
      "base64url"
    );

    if (
      iv.length !== 12 ||
      tag.length !== 16 ||
      encrypted.length === 0
    ) {
      throw new Error("Invalid encrypted data");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      iv
    );

    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    const raw: unknown = JSON.parse(decrypted);

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      throw new Error("Invalid token data");
    }

    const tokens = raw as Record<string, unknown>;

    if (
      typeof tokens.accessToken !== "string" ||
      !tokens.accessToken ||
      typeof tokens.refreshToken !== "string" ||
      !tokens.refreshToken ||
      typeof tokens.expiresAt !== "number" ||
      !Number.isFinite(tokens.expiresAt)
    ) {
      throw new Error("Incomplete token data");
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
  } catch {
    throw new CalendarServerError(
      "無法讀取 Google 授權資料，請重新連接 Google 帳號。",
      409
    );
  }
}

export async function readGoogleConnection(
  userId: string
): Promise<GoogleConnection | null> {
  const { data, error } = await getCalendarAdmin()
    .from("google_calendar_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new CalendarServerError(
      "無法讀取 Google 連接資料，請稍後重試。",
      503
    );
  }

  return data
    ? (data as unknown as GoogleConnection)
    : null;
}

export async function saveGoogleConnection(
  userId: string,
  account: GoogleAccount,
  tokens: GoogleTokens,
  scopes: string[]
): Promise<void> {
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
        granted_scopes: [...new Set(scopes)],
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    throw new CalendarServerError(
      "Google 授權資料儲存失敗，請重新連接。",
      503
    );
  }
}

export async function getGoogleAccessToken(
  userId: string
): Promise<{
  accessToken: string;
  connection: GoogleConnection;
}> {
  const connection =
    await readGoogleConnection(userId);

  if (!connection) {
    throw new CalendarServerError(
      "請先連接 Google 日曆。",
      409
    );
  }

  if (
    !connection.granted_scopes.includes(
      GOOGLE_CALENDAR_SCOPE
    )
  ) {
    throw new CalendarServerError(
      "Google 日曆權限不足，請重新授權。",
      403
    );
  }

  const tokens = decryptTokens(
    connection.tokens_encrypted,
    userId
  );

  // 保留一分鐘餘裕，避免請求途中過期。
  if (tokens.expiresAt > Date.now() + 60_000) {
    return {
      accessToken: tokens.accessToken,
      connection,
    };
  }

  const config = getGoogleConfig();

  const result = await requestGoogleTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
    })
  );

  const refreshedTokens: GoogleTokens = {
    accessToken: result.access_token,
    refreshToken:
      result.refresh_token || tokens.refreshToken,
    expiresAt:
      Date.now() + result.expires_in * 1000,
  };

  const encrypted = encryptTokens(
    refreshedTokens,
    userId
  );

  const updatedAt = new Date().toISOString();

  // 只更新原本的連接，避免覆蓋剛更換的 Google 帳號。
  const { data, error } = await getCalendarAdmin()
    .from("google_calendar_connections")
    .update({
      tokens_encrypted: encrypted,
      updated_at: updatedAt,
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
      "Google 授權更新失敗，請稍後重試。",
      503
    );
  }

  if (!data) {
    throw new CalendarServerError(
      "Google 帳號已變更，請重新確認帳號後再操作。",
      409
    );
  }

  return {
    accessToken: refreshedTokens.accessToken,
    connection: {
      ...connection,
      tokens_encrypted: encrypted,
      updated_at: updatedAt,
    },
  };
}

export function calendarErrorResponse(
  error: unknown
): Response {
  const knownError =
    error instanceof CalendarServerError;

  return Response.json(
    {
      error: knownError
        ? error.message
        : "Google 日曆操作失敗，請稍後重試。",
    },
    {
      status: knownError ? error.status : 500,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}