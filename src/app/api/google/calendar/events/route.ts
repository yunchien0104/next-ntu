import { createHash } from "node:crypto";

import {
  CalendarServerError,
  calendarErrorResponse,
  getCalendarUserClient,
  getGoogleAccessToken,
  readGoogleConnection,
  requireCalendarOrigin,
  requireCalendarUser,
} from "@/lib/google/calendar/calendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StoredTask {
  id: string;
  title: string;
  date: string;
  time: string;
  guests: string[] | null;
  notes: string | null;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function googleRequest(
  url: string,
  accessToken: string,
  body?: Record<string, unknown>
): Promise<Response> {
  try {
    return await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body
        ? { body: JSON.stringify(body) }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new CalendarServerError(
      "Google 暫時沒有回應，請重試匯入同一筆任務。",
      502
    );
  }
}

function throwGoogleError(status: number): never {
  if (status === 401) {
    throw new CalendarServerError(
      "Google 授權已失效，請重新連接 Google 帳號。",
      409
    );
  }

  if (status === 403) {
    throw new CalendarServerError(
      "Google 拒絕日曆操作，請確認 Calendar API 已啟用，並重新授權日曆權限。",
      403
    );
  }

  if (status === 429) {
    throw new CalendarServerError(
      "Google 日曆請求過於頻繁，請稍後重試。",
      429
    );
  }

  throw new CalendarServerError(
    "Google 日曆匯入失敗，請稍後重試同一筆任務。",
    502
  );
}

async function readGoogleEvent(
  response: Response
): Promise<GoogleEvent> {
  try {
    const result: unknown = await response.json();

    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      throw new Error("Invalid response");
    }

    return result as GoogleEvent;
  } catch {
    throw new CalendarServerError(
      "無法確認 Google 匯入結果，請重試同一筆任務。",
      502
    );
  }
}

export async function POST(request: Request) {
  try {
    requireCalendarOrigin(request);

    const {
      user,
      accessToken: supabaseAccessToken,
    } = await requireCalendarUser(request);

    const rawInput: unknown =
      await request.json().catch(() => null);

    if (
      !rawInput ||
      typeof rawInput !== "object" ||
      Array.isArray(rawInput)
    ) {
      throw new CalendarServerError(
        "匯入資料格式不正確。",
        400
      );
    }

    const input = rawInput as Record<string, unknown>;
    const taskId = input.taskId;
    const expectedConnectionId = input.connectionId;
    const inviteGuests = input.inviteGuests === true;

    if (
      typeof taskId !== "string" ||
      !UUID_PATTERN.test(taskId) ||
      typeof expectedConnectionId !== "string" ||
      !UUID_PATTERN.test(expectedConnectionId)
    ) {
      throw new CalendarServerError(
        "任務或 Google 帳號資料不完整，請重新確認帳號。",
        400
      );
    }

    // 使用目前登入者的憑證讀取任務，套用 Supabase RLS。
    const client =
      getCalendarUserClient(supabaseAccessToken);

    const { data, error } = await client
      .from("career_tasks")
      .select("id,title,date,time,guests,notes")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new CalendarServerError(
        "無法讀取任務，請稍後重試。",
        503
      );
    }

    if (!data) {
      throw new CalendarServerError(
        "找不到這筆任務，請重新讀取日曆。",
        404
      );
    }

    const task = data as unknown as StoredTask;
    const time = task.time.slice(0, 5);
    const parsedDate = new Date(
      `${task.date}T00:00:00Z`
    );

    if (
      !task.title.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(task.date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !==
        task.date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ) {
      throw new CalendarServerError(
        "任務的名稱、日期或時間不正確，請先修改任務。",
        400
      );
    }

    const guests = [
      ...new Set(
        (task.guests ?? [])
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (
      inviteGuests &&
      guests.some(
        (email) =>
          !/^[^\s@,]+@gmail\.com$/i.test(email)
      )
    ) {
      throw new CalendarServerError(
        "協作者請輸入有效的 Gmail 帳號。",
        400
      );
    }

    // 取得這位 Next@NTU 使用者授權的 Google 憑證。
    const { accessToken, connection } =
      await getGoogleAccessToken(user.id);

    if (
      connection.connection_id !==
      expectedConnectionId
    ) {
      throw new CalendarServerError(
        "Google 帳號已變更，請重新確認帳號後再匯入。",
        409
      );
    }

    // 同一任務、同一 Google 帳號使用固定活動 ID。
    // 網路失敗後重試，仍會沿用相同 ID。
    const eventId = createHash("sha256")
      .update(
        JSON.stringify([
          user.id,
          connection.google_subject,
          task.id,
        ])
      )
      .digest("hex");

    const start = new Date(
      `${task.date}T${time}:00+08:00`
    );

    const end = new Date(
      start.getTime() + 60 * 60 * 1000
    );

    const eventBody: Record<string, unknown> = {
      id: eventId,
      summary: task.title.trim(),
      description:
        task.notes?.trim() || "由 Next@NTU 建立",
      start: {
        dateTime: start.toISOString(),
        timeZone: "Asia/Taipei",
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: "Asia/Taipei",
      },
      extendedProperties: {
        private: {
          nextNtuUserId: user.id,
          nextNtuTaskId: task.id,
        },
      },
    };

    // 只有使用者勾選邀請協作者，才加入來賓。
    if (inviteGuests && guests.length > 0) {
      eventBody.attendees = guests.map((email) => ({
        email,
      }));
    }

    // 寫入前再次確認授權帳號沒有被更換。
    const currentConnection =
      await readGoogleConnection(user.id);

    if (
      !currentConnection ||
      currentConnection.connection_id !==
        expectedConnectionId
    ) {
      throw new CalendarServerError(
        "Google 帳號已變更，請重新確認帳號。",
        409
      );
    }

    // primary 指的是 accessToken 所屬帳號的主要日曆。
    const eventsUrl =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    const response = await googleRequest(
      `${eventsUrl}?sendUpdates=all`,
      accessToken,
      eventBody
    );

    let alreadyImported = false;

    if (response.status === 409) {
      // 相同活動 ID 已存在，讀回確認，避免重複新增。
      const existingResponse = await googleRequest(
        `${eventsUrl}/${eventId}`,
        accessToken
      );

      if (!existingResponse.ok) {
        throwGoogleError(existingResponse.status);
      }

      const existing =
        await readGoogleEvent(existingResponse);

      if (existing.status === "cancelled") {
        throw new CalendarServerError(
          "這筆活動已在 Google 日曆刪除。如需重新建立，請在 Next@NTU 新增一筆任務再匯入。",
          409
        );
      }

      if (
        existing.id !== eventId ||
        existing.extendedProperties?.private
          ?.nextNtuUserId !== user.id ||
        existing.extendedProperties?.private
          ?.nextNtuTaskId !== task.id
      ) {
        throw new CalendarServerError(
          "無法確認既有 Google 活動，請稍後重試。",
          409
        );
      }

      alreadyImported = true;
    } else {
      if (!response.ok) {
        throwGoogleError(response.status);
      }

      const created =
        await readGoogleEvent(response);

      if (created.id !== eventId) {
        throw new CalendarServerError(
          "無法確認 Google 匯入結果，請重試同一筆任務。",
          502
        );
      }
    }

    return Response.json(
      {
        success: true,
        eventId,
        email: connection.google_email,
        alreadyImported,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}