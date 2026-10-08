import {
  GOOGLE_CALENDAR_SCOPE,
  calendarErrorResponse,
  readGoogleConnection,
  requireCalendarUser,
} from "@/lib/google/calendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 驗證目前登入的 Next@NTU 使用者。
    const { user } =
      await requireCalendarUser(request);

    // 只查詢這位使用者自己的連接資料。
    const connection =
      await readGoogleConnection(user.id);

    if (!connection) {
      return Response.json(
        {
          connected: false,
          email: null,
          connectionId: null,
          needsReconnect: false,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const hasCalendarPermission =
      connection.granted_scopes.includes(
        GOOGLE_CALENDAR_SCOPE
      );

    // 只回傳畫面需要的資訊，不回傳授權憑證。
    return Response.json(
      {
        connected: hasCalendarPermission,
        email: connection.google_email,
        connectionId:
          connection.connection_id,
        needsReconnect:
          !hasCalendarPermission,
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