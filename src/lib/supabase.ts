import {
  createClient,
  type Session,
} from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("缺少 Supabase 環境變數。");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

let refreshing: Promise<Session> | null = null;

async function refreshLogin(): Promise<Session> {
  if (!refreshing) {
    refreshing = (async () => {
      const { data, error } =
        await supabase.auth.refreshSession();

      if (error) {
        throw new Error(
          "登入憑證更新失敗，請確認網路；若仍失敗，請重新登入。"
        );
      }

      if (!data.session) {
        throw new Error("登入已失效，請重新登入。");
      }

      return data.session;
    })();
  }

  const pending = refreshing;

  try {
    return await pending;
  } finally {
    if (refreshing === pending) {
      refreshing = null;
    }
  }
}

export async function getValidSession(
  ownerId: string,
  forceRefresh = false
): Promise<Session> {
  const { data, error } =
    await supabase.auth.getSession();

  if (error) {
    throw new Error("無法取得登入狀態，請確認網路後重試。");
  }

  let session = data.session;

  if (!session) {
    throw new Error("登入已失效，請重新登入。");
  }

  if (session.user.id !== ownerId) {
    throw new Error("登入帳號已變更，請重新整理頁面。");
  }

  const expiresSoon =
    !session.expires_at ||
    session.expires_at * 1000 <= Date.now() + 60_000;

  if (forceRefresh || expiresSoon) {
    session = await refreshLogin();
  }

  if (session.user.id !== ownerId) {
    throw new Error("登入帳號已變更，請重新整理頁面。");
  }

  return session;
}