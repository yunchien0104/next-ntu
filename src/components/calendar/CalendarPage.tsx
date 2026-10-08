"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import { Field, inputClass, Modal } from "@/components/ui/Modal";

import { supabase } from "@/lib/supabase";
import {
  sortCareerTasks,
  type CareerTask,
} from "@/lib/tasks/types";
import type { CloudTasks } from "@/lib/tasks/useCloudTasks";

interface CalendarPageProps {
  taskStore: CloudTasks;
  notify: (message: string) => void;
  draftTitle?: string;
  onDraftConsumed: () => void;
}

interface CalendarForm {
  title: string;
  date: string;
  time: string;
  guests: string;
  notes: string;
}

interface GoogleStatus {
  connected: boolean;
  email: string | null;
  connectionId: string | null;
  needsReconnect: boolean;
}

interface ImportResult {
  success: boolean;
  email: string;
  alreadyImported: boolean;
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const emptyGoogleStatus: GoogleStatus = {
  connected: false,
  email: null,
  connectionId: null,
  needsReconnect: false,
};

const googleButtonClass =
  "shrink-0 border border-[var(--line-strong)] px-3 py-2 " +
  "text-xs font-semibold text-[var(--text)] transition " +
  "hover:bg-[var(--panel-2)] disabled:cursor-not-allowed " +
  "disabled:opacity-40";

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, milliseconds);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function getTaipeiToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthFor(date: string): Date {
  const value = new Date(`${date}T00:00:00Z`);

  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)
  );
}

function emptyForm(date: string): CalendarForm {
  return {
    title: "",
    date,
    time: "10:00",
    guests: "",
    notes: "",
  };
}

function taskToForm(task: CareerTask): CalendarForm {
  return {
    title: task.title,
    date: task.date,
    time: task.time,
    guests: task.guests.join(", "),
    notes: task.notes,
  };
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "未提供";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function taskClass(task: CareerTask): string {
  if (task.guests.length > 0) {
    return "bg-[#666] text-white";
  }

  if (task.source === "todo") {
    return "border border-[#666] bg-[#242424] text-[#ddd]";
  }

  return "bg-[var(--paper)] text-[var(--paper-ink)]";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "操作失敗，請稍後重試";
}

export function CalendarPage({
  taskStore,
  notify,
  draftTitle,
  onDraftConsumed,
}: CalendarPageProps) {
  const [today, setToday] = useState(getTaipeiToday);
  const [cursor, setCursor] = useState(
    () => monthFor(getTaipeiToday())
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarForm>(
    () => emptyForm(getTaipeiToday())
  );

  const [operation, setOperation] =
    useState<"save" | "delete" | "export" | null>(null);

  const [localError, setLocalError] = useState("");
  const [inviteGuests, setInviteGuests] = useState(false);

  const [googleStatus, setGoogleStatus] =
    useState<GoogleStatus>(emptyGoogleStatus);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [googleNotice, setGoogleNotice] = useState("");

  const formRef = useRef<HTMLFormElement>(null);
  const operationRef = useRef(false);
  const connectingRef = useRef(false);
  const aliveRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const statusRevisionRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);

  const editingTask =
    taskStore.tasks.find((task) => task.id === editingId) ?? null;

  const missingTask = editingId !== null && editingTask === null;

  // 任務載入只限制任務操作，不再限制 Google 帳號操作。
  const blocked =
    !taskStore.ready ||
    taskStore.loading ||
    taskStore.busy ||
    operation !== null ||
    googleConnecting;

  const mutationBlocked = blocked || missingTask;

  const googleActionBlocked =
    taskStore.busy ||
    operation !== null ||
    googleConnecting;

  const canImport =
    googleStatus.connected &&
    Boolean(googleStatus.connectionId) &&
    !googleLoading &&
    !googleConnecting;

  const requestGoogle = useCallback(
    async <T,>(
      path: string,
      method: "GET" | "POST" = "GET",
      body?: Record<string, unknown>,
      options: RequestOptions = {}
    ): Promise<T> => {
      const controller = new AbortController();

      const abortFromCaller = () => controller.abort();
      const externalSignal = options.signal;

      if (externalSignal?.aborted) {
        throw new Error("查詢已取消");
      }

      externalSignal?.addEventListener(
        "abort",
        abortFromCaller,
        { once: true }
      );

      const timer = window.setTimeout(() => {
        controller.abort();
      }, options.timeoutMs ?? 30_000);

      try {
        // 登入狀態也有逾時限制，避免卡住整個查詢。
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          10_000,
          "取得登入狀態逾時，請重新整理頁面；若仍失敗，請重新登入。"
        );

        if (controller.signal.aborted) {
          throw new Error("查詢已取消或逾時");
        }

        if (error || !data.session) {
          throw new Error("登入已失效，請重新登入 Next@NTU");
        }

        const session = data.session;

        if (
          ownerRef.current &&
          ownerRef.current !== session.user.id
        ) {
          throw new Error("登入帳號已變更，請重新開啟日曆");
        }

        ownerRef.current = session.user.id;

        const response = await fetch(path, {
          method,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        const text = await response.text();

        let result: unknown = null;

        try {
          result = JSON.parse(text);
        } catch {
          if (response.status === 404) {
            throw new Error(
              `找不到 API：${path}。請確認路由檔案已建立；正式網站需要部署最新版程式。`
            );
          }

          throw new Error(
            `API 未回傳有效資料（HTTP ${response.status}），請確認網站部署與伺服器設定。`
          );
        }

        if (!response.ok) {
          const message =
            result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : `Google 日曆操作失敗（HTTP ${response.status}）`;

          throw new Error(message);
        }

        if (
          !result ||
          typeof result !== "object" ||
          Array.isArray(result)
        ) {
          throw new Error("伺服器回應不完整，請稍後重試");
        }

        return result as T;
      } catch (error) {
        if (externalSignal?.aborted) {
          throw new Error("查詢已取消");
        }

        if (controller.signal.aborted) {
          throw new Error(
            "Google 日曆請求逾時，請按「重新確認帳號」或重試操作。"
          );
        }

        if (
          error instanceof TypeError ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw new Error(
            "無法連線到伺服器，請檢查網路或稍後重試。"
          );
        }

        throw error;
      } finally {
        window.clearTimeout(timer);
        externalSignal?.removeEventListener(
          "abort",
          abortFromCaller
        );
      }
    },
    []
  );

  const loadGoogleStatus = useCallback(async () => {
    if (!aliveRef.current) return;

    // 取消前次查詢；重新確認按鈕不會被載入狀態鎖住。
    const revision = ++statusRevisionRef.current;
    statusControllerRef.current?.abort();

    const controller = new AbortController();
    statusControllerRef.current = controller;

    setGoogleLoading(true);
    setGoogleError("");

    try {
      const result = await requestGoogle<GoogleStatus>(
        "/api/google/calendar/status",
        "GET",
        undefined,
        {
          signal: controller.signal,
          timeoutMs: 20_000,
        }
      );

      if (
        typeof result.connected !== "boolean" ||
        typeof result.needsReconnect !== "boolean" ||
        (result.connected &&
          (typeof result.email !== "string" ||
            typeof result.connectionId !== "string"))
      ) {
        throw new Error("Google 連接資料不完整");
      }

      if (
        !aliveRef.current ||
        revision !== statusRevisionRef.current
      ) {
        return;
      }

      setGoogleStatus(result);
    } catch (error) {
      if (
        aliveRef.current &&
        revision === statusRevisionRef.current
      ) {
        setGoogleStatus(emptyGoogleStatus);
        setGoogleError(errorMessage(error));
      }
    } finally {
      if (
        aliveRef.current &&
        revision === statusRevisionRef.current
      ) {
        statusControllerRef.current = null;
        setGoogleLoading(false);
      }
    }
  }, [requestGoogle]);

  useEffect(() => {
    aliveRef.current = true;
    void loadGoogleStatus();

    const url = new URL(window.location.href);
    const result = url.searchParams.get("googleCalendar");
    const message = url.searchParams.get("googleCalendarMessage");

    if (result === "connected") {
      setGoogleNotice("Google 日曆已連接，請確認下方帳號。");
    } else if (result === "cancelled") {
      setGoogleNotice(message || "你已取消 Google 日曆授權");
    } else if (result === "error") {
      setGoogleNotice(message || "Google 日曆連接失敗");
    }

    if (result) {
      url.searchParams.delete("googleCalendar");
      url.searchParams.delete("googleCalendarMessage");

      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
    }

    // 從 Google 頁面按上一頁返回時，恢復按鈕狀態。
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;

      connectingRef.current = false;
      setGoogleConnecting(false);
      void loadGoogleStatus();
    }

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      aliveRef.current = false;
      statusRevisionRef.current++;
      statusControllerRef.current?.abort();
      statusControllerRef.current = null;
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [loadGoogleStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(getTaipeiToday());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !draftTitle ||
      operation !== null ||
      taskStore.busy ||
      googleConnecting
    ) {
      return;
    }

    const date = getTaipeiToday();

    setEditingId(null);
    setLocalError("");
    setInviteGuests(false);
    setForm({
      ...emptyForm(date),
      title: draftTitle,
      notes: "想了解你的學習／職涯路徑，預計 20–30 分鐘。",
    });
    setCursor(monthFor(date));
    setModalOpen(true);
    onDraftConsumed();
  }, [
    draftTitle,
    onDraftConsumed,
    operation,
    taskStore.busy,
    googleConnecting,
  ]);

  const cells = useMemo(() => {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const start = new Date(
      Date.UTC(year, month, 1 - first.getUTCDay())
    );

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);

      return {
        date,
        key: date.toISOString().slice(0, 10),
        outside: date.getUTCMonth() !== month,
      };
    });
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CareerTask[]>();

    for (const task of sortCareerTasks(taskStore.tasks)) {
      const items = grouped.get(task.date) ?? [];
      items.push(task);
      grouped.set(task.date, items);
    }

    return grouped;
  }, [taskStore.tasks]);

  async function connectGoogle() {
    if (modalOpen) {
      notify("請先儲存或關閉任務視窗，再連接 Google");
      return;
    }

    if (
      googleActionBlocked ||
      operationRef.current ||
      connectingRef.current
    ) {
      return;
    }

    connectingRef.current = true;
    setGoogleConnecting(true);
    setGoogleError("");
    setGoogleNotice("正在準備 Google 帳號選擇頁面…");

    // 連接帳號不必等待狀態查詢完成。
    statusRevisionRef.current++;
    statusControllerRef.current?.abort();
    statusControllerRef.current = null;
    setGoogleLoading(false);

    let navigating = false;

    try {
      const result = await requestGoogle<{ url: string }>(
        "/api/google/calendar/connect",
        "POST",
        undefined,
        { timeoutMs: 30_000 }
      );

      if (typeof result.url !== "string") {
        throw new Error("伺服器未提供 Google 授權網址");
      }

      const url = new URL(result.url);

      if (
        url.origin !== "https://accounts.google.com" ||
        url.pathname !== "/o/oauth2/v2/auth"
      ) {
        throw new Error("Google 授權網址不正確");
      }

      if (!aliveRef.current) return;

      setGoogleNotice("正在前往 Google 選擇帳號…");
      window.location.assign(url.toString());
      navigating = true;
    } catch (error) {
      if (aliveRef.current) {
        setGoogleNotice("");
        setGoogleError(errorMessage(error));
        notify("Google 連接失敗，請查看頁面錯誤訊息");
      }
    } finally {
      if (!navigating) {
        connectingRef.current = false;

        if (aliveRef.current) {
          setGoogleConnecting(false);
        }
      }
    }
  }

  function openNew(date = getTaipeiToday()) {
    if (blocked || operationRef.current) return;

    setEditingId(null);
    setLocalError("");
    setInviteGuests(false);
    setForm(emptyForm(date));
    setModalOpen(true);
  }

  function openTask(task: CareerTask) {
    if (blocked || operationRef.current) return;

    setEditingId(task.id);
    setLocalError("");
    setInviteGuests(false);
    setForm(taskToForm(task));
    setModalOpen(true);
  }

  function closeModal() {
    if (taskStore.busy || operationRef.current) return;

    setModalOpen(false);
    setEditingId(null);
    setLocalError("");
    setInviteGuests(false);
  }

  function changeMonth(offset: number) {
    setCursor(
      (current) =>
        new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth() + offset,
            1
          )
        )
    );
  }

  function goToday() {
    const date = getTaipeiToday();
    setToday(date);
    setCursor(monthFor(date));
  }

  function updateField(field: keyof CalendarForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(importToGoogle = false) {
    if (mutationBlocked || operationRef.current) return;

    setLocalError("");

    if (!formRef.current?.reportValidity()) return;

    if (!form.title.trim()) {
      setLocalError("請填寫任務名稱");
      return;
    }

    if (importToGoogle && !canImport) {
      setLocalError(
        "請先儲存任務，再到日曆頁面確認或連接 Google 帳號。"
      );
      return;
    }

    const guests = [
      ...new Set(
        form.guests
          .split(/[,，]/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (
      guests.some(
        (email) => !/^[^\s@,]+@gmail\.com$/i.test(email)
      )
    ) {
      setLocalError("協作者請輸入有效的 Gmail 帳號");
      return;
    }

    const parsedDate = new Date(`${form.date}T00:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== form.date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)
    ) {
      setLocalError("請填寫有效的日期與時間");
      return;
    }

    const targetId = editingId;
    const expectedConnectionId = googleStatus.connectionId;
    const shouldInvite = inviteGuests;

    const input = {
      title: form.title.trim(),
      date: form.date,
      time: form.time,
      guests,
      notes: form.notes,
    };

    let savedTask: CareerTask | null = null;

    operationRef.current = true;
    setOperation("save");

    try {
      savedTask =
        targetId !== null
          ? await taskStore.updateTask(targetId, input)
          : await taskStore.createTask({
              ...input,
              source: "calendar",
            });

      if (!savedTask) {
        throw new Error("任務儲存失敗，內容已保留，請重試。");
      }

      if (!aliveRef.current) return;

      setCursor(monthFor(savedTask.date));

      // 匯入失敗後沿用已儲存的任務，避免重複新增。
      setEditingId(savedTask.id);
      setForm(taskToForm(savedTask));

      if (importToGoogle) {
        setOperation("export");

        const result = await requestGoogle<ImportResult>(
          "/api/google/calendar/events",
          "POST",
          {
            taskId: savedTask.id,
            connectionId: expectedConnectionId,
            inviteGuests: shouldInvite,
          },
          { timeoutMs: 45_000 }
        );

        if (
          result.success !== true ||
          typeof result.email !== "string" ||
          typeof result.alreadyImported !== "boolean"
        ) {
          throw new Error("無法確認 Google 匯入結果，請重試。");
        }

        if (!aliveRef.current) return;

        setGoogleNotice(
          result.alreadyImported
            ? `這筆任務已匯入 ${result.email}，未重複新增或修改 Google 活動。`
            : `已匯入 ${result.email} 的 Google 日曆。`
        );

        notify(
          result.alreadyImported
            ? "這筆任務已匯入 Google 日曆"
            : "已儲存並匯入 Google 日曆"
        );
      } else {
        notify(
          targetId !== null
            ? "已更新日曆與生涯待辦"
            : "已加入日曆與生涯待辦"
        );
      }

      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm(getTaipeiToday()));
      setInviteGuests(false);
    } catch (error) {
      if (!aliveRef.current) return;

      setLocalError(
        savedTask
          ? `任務已存入 Next@NTU，但 Google 匯入未完成：${errorMessage(
              error
            )} 可以在此視窗重試，不會另建任務。`
          : errorMessage(error)
      );

      notify(
        savedTask
          ? "任務已儲存，Google 匯入未完成"
          : "任務儲存失敗"
      );
    } finally {
      operationRef.current = false;

      if (aliveRef.current) setOperation(null);
    }
  }

  async function deleteCurrentTask() {
    if (
      !editingId ||
      mutationBlocked ||
      operationRef.current
    ) {
      return;
    }

    operationRef.current = true;
    setOperation("delete");
    setLocalError("");

    try {
      const success = await taskStore.deleteTask(editingId);

      if (!success) {
        throw new Error("刪除失敗，任務仍保留，請重試。");
      }

      if (!aliveRef.current) return;

      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm(getTaipeiToday()));
      setInviteGuests(false);
      notify("已從日曆與生涯待辦刪除任務");
    } catch (error) {
      if (aliveRef.current) {
        setLocalError(errorMessage(error));
        notify("任務刪除失敗");
      }
    } finally {
      operationRef.current = false;

      if (aliveRef.current) setOperation(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  const connectLabel = googleConnecting
    ? "正在開啟 Google…"
    : googleStatus.needsReconnect
      ? "重新授權 Google 日曆"
      : googleStatus.connected
        ? "更換 Google 帳號"
        : "連接 Google 日曆";

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)]">
      <FeatureHeader
        eyebrow="PLAN & COLLABORATE"
        title={`${cursor.getUTCFullYear()} 年 ${
          cursor.getUTCMonth() + 1
        } 月`}
        description="把生涯待辦、截止日與日曆活動放進同一個時間軸。"
        actions={
          <>
            <Button
              variant="primary"
              disabled={blocked}
              onClick={() => openNew()}
            >
              ＋ 建立任務
            </Button>

            <Button onClick={() => changeMonth(-1)}>←</Button>
            <Button onClick={goToday}>今天</Button>
            <Button onClick={() => changeMonth(1)}>→</Button>

            <button
              type="button"
              className={googleButtonClass}
              disabled={googleActionBlocked || modalOpen}
              onClick={() => void connectGoogle()}
            >
              {connectLabel}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-3">
        <div className="min-w-0 text-xs" aria-live="polite">
          <p className="break-all text-[var(--text)]">
            {googleLoading
              ? "正在確認 Google 日曆帳號…"
              : googleError
                ? "Google 帳號確認失敗，請查看下方訊息。"
                : googleStatus.connected
                  ? `已連接：${googleStatus.email}`
                  : googleStatus.needsReconnect
                    ? `需要重新授權：${googleStatus.email}`
                    : "尚未連接 Google 日曆"}
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            匯入活動會寫入此授權帳號的主要日曆。
          </p>
        </div>

        <button
          type="button"
          className={googleButtonClass}
          disabled={googleActionBlocked}
          onClick={() => void loadGoogleStatus()}
        >
          {googleLoading ? "重新開始查詢" : "重新確認帳號"}
        </button>
      </div>

      {googleNotice && (
        <p
          role="status"
          className="border-b border-[var(--line)] px-5 py-3 text-xs leading-6 text-[var(--soft)]"
        >
          {googleNotice}
        </p>
      )}

      {googleError && (
        <p
          role="alert"
          className="break-words border-b border-[var(--line)] px-5 py-3 text-xs leading-6 text-red-400"
        >
          Google 日曆：{googleError}
        </p>
      )}

      {taskStore.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3"
        >
          <p className="break-words text-xs text-[var(--soft)]">
            任務同步失敗：{taskStore.error}
          </p>
          <Button
            disabled={
              taskStore.loading ||
              taskStore.busy ||
              operation !== null ||
              googleConnecting
            }
            onClick={() => void taskStore.reload()}
          >
            重新讀取
          </Button>
        </div>
      )}

      {taskStore.loading && (
        <p
          role="status"
          className="px-5 py-3 text-xs text-[var(--muted)]"
        >
          正在讀取日曆任務…
        </p>
      )}

      <div className="grid min-h-[680px] lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] p-5 lg:border-r lg:border-b-0">
          <Button
            variant="primary"
            full
            disabled={blocked}
            onClick={() => openNew()}
          >
            ＋ 建立任務
          </Button>

          <h2 className="mt-7 text-xs font-semibold">我的日曆</h2>

          <div className="mt-3 space-y-3 text-xs text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[var(--paper)]" />
              日曆活動
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[#777]" />
              協作任務
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[#333] ring-1 ring-[#777]" />
              生涯待辦
            </div>
          </div>

          <p className="mt-7 border border-[var(--line)] p-3 text-[10px] leading-5 text-[var(--muted)]">
            點擊任務可查看詳情、修改或刪除。
            點擊日期空白處可新增任務。
            修改會同步到生涯待辦，時間以台灣時間為準。
          </p>

          <p className="mt-3 border border-[var(--line)] p-3 text-[10px] leading-5 text-[var(--muted)]">
            先連接 Google 帳號，再於任務視窗按「儲存並匯入 Google」。
            活動長度為一小時。
            Next@NTU 後續修改與刪除不會同步到 Google 活動。
          </p>
        </aside>

        <section className="min-w-0 overflow-x-auto p-3 md:p-5">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-t border-l border-[var(--line)]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day) => (
                  <span
                    key={day}
                    className="border-r border-b border-[var(--line)] p-2 text-center font-mono text-[9px] text-[var(--muted)]"
                  >
                    {day}
                  </span>
                )
              )}
            </div>

            <div className="grid grid-cols-7 border-l border-[var(--line)]">
              {cells.map((cell) => {
                const isToday = cell.key === today;
                const events = eventsByDate.get(cell.key) ?? [];

                return (
                  <div
                    key={cell.key}
                    className={`relative isolate flex min-h-24 min-w-0 flex-col border-r border-b border-[var(--line)] p-2 ${
                      cell.outside ? "opacity-40" : ""
                    } ${isToday ? "bg-[var(--panel)]" : ""}`}
                  >
                    <button
                      type="button"
                      aria-label={`在 ${cell.key} 新增任務`}
                      disabled={blocked}
                      className="absolute inset-0 z-0 transition hover:bg-[var(--panel-2)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--paper)] disabled:cursor-default"
                      onClick={() => openNew(cell.key)}
                    />

                    <span
                      className={`pointer-events-none relative z-10 grid h-6 w-6 place-items-center text-[10px] ${
                        isToday
                          ? "bg-[var(--paper)] text-[var(--paper-ink)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {cell.date.getUTCDate()}
                    </span>

                    <div className="pointer-events-none relative z-10 mt-1 grid min-w-0 gap-1">
                      {events.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={blocked}
                          aria-label={`查看任務：${item.title}`}
                          title={`${item.time} ${item.title}${
                            item.done ? "（已完成）" : ""
                          }`}
                          style={{
                            fontSize: "9px",
                            lineHeight: "14px",
                          }}
                          className={`pointer-events-auto block w-full min-w-0 overflow-hidden px-1.5 py-1 text-left transition hover:brightness-125 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--paper)] disabled:cursor-default ${taskClass(
                            item
                          )} ${
                            item.done ? "opacity-50 line-through" : ""
                          }`}
                          onClick={() => openTask(item)}
                        >
                          <span
                            className="block truncate"
                            style={{
                              fontSize: "9px",
                              lineHeight: "14px",
                              fontWeight: 400,
                            }}
                          >
                            {item.done ? "✓ " : ""}
                            {item.time} {item.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={modalOpen}
        title={
          editingId !== null
            ? "任務詳情與編輯"
            : "建立日曆任務"
        }
        onClose={closeModal}
        footer={
          <>
            {editingId !== null && (
              <Button
                className="border-red-400/40 text-red-400"
                disabled={mutationBlocked}
                onClick={() => void deleteCurrentTask()}
              >
                {operation === "delete" ? "刪除中…" : "刪除任務"}
              </Button>
            )}

            <Button
              disabled={taskStore.busy || operation !== null}
              onClick={closeModal}
            >
              取消
            </Button>

            <Button
              disabled={mutationBlocked}
              onClick={() => void save(false)}
            >
              {operation === "save"
                ? "儲存中…"
                : editingId !== null
                  ? "儲存修改"
                  : "只加入 Next@NTU"}
            </Button>

            <Button
              variant="primary"
              disabled={mutationBlocked || !canImport}
              onClick={() => void save(true)}
            >
              {operation === "export"
                ? "匯入 Google 中…"
                : "儲存並匯入 Google"}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          {editingTask && (
            <div className="border border-[var(--line)] bg-[var(--bg)] p-3 text-[10px] leading-6 text-[var(--muted)]">
              <p>狀態：{editingTask.done ? "已完成" : "未完成"}</p>
              <p>
                來源：
                {editingTask.source === "todo"
                  ? "生涯待辦"
                  : "日曆活動"}
              </p>
              <p>
                建立時間：{formatTimestamp(editingTask.createdAt)}
              </p>
              <p>
                更新時間：{formatTimestamp(editingTask.updatedAt)}
              </p>
            </div>
          )}

          {missingTask && (
            <p role="alert" className="text-xs text-red-400">
              這筆任務已不在目前資料中，請關閉視窗並重新讀取。
            </p>
          )}

          <fieldset
            disabled={mutationBlocked}
            className="space-y-4"
          >
            <Field label="任務名稱">
              <input
                className={inputClass}
                value={form.title}
                onChange={(event) =>
                  updateField("title", event.target.value)
                }
                placeholder="例如：Coffee chat with Amy"
                required
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="日期">
                <input
                  className={inputClass}
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    updateField("date", event.target.value)
                  }
                  required
                />
              </Field>
              <Field label="時間">
                <input
                  className={inputClass}
                  type="time"
                  step={60}
                  value={form.time}
                  onChange={(event) =>
                    updateField("time", event.target.value)
                  }
                  required
                />
              </Field>
            </div>

            <Field label="協作者（Gmail，選填，可用逗號分隔）">
              <input
                className={inputClass}
                value={form.guests}
                onChange={(event) =>
                  updateField("guests", event.target.value)
                }
                placeholder="teammate@gmail.com"
              />
            </Field>

            <Field label="說明（選填）">
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={form.notes}
                onChange={(event) =>
                  updateField("notes", event.target.value)
                }
                placeholder="議程、準備資料或會議連結"
              />
            </Field>

            <div className="border border-[var(--line)] p-3 text-xs leading-6">
              <p className="break-all">
                {googleLoading
                  ? "正在確認 Google 帳號…"
                  : canImport
                    ? `Google 匯入帳號：${googleStatus.email}`
                    : "請先儲存任務，再於日曆頁面確認或連接 Google 帳號。"}
              </p>

              {canImport && (
                <label className="mt-2 flex items-start gap-2 text-[var(--soft)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={inviteGuests}
                    onChange={(event) =>
                      setInviteGuests(event.target.checked)
                    }
                  />
                  <span>
                    匯入時邀請上方協作者，並由 Google 寄送邀請。
                    未勾選則只建立自己的活動。
                  </span>
                </label>
              )}
            </div>
          </fieldset>

          <p className="text-[10px] leading-5 text-[var(--muted)]">
            新增、修改與刪除會同步到生涯待辦；時間以台灣時間為準。
            Google 活動需在 Google 日曆自行修改或刪除。
            同一任務重複匯入相同 Google 帳號，不會重複新增或更新既有 Google 活動。
          </p>

          {(localError || taskStore.error) && (
            <div
              role="alert"
              className="space-y-1 break-words text-xs leading-5 text-red-400"
            >
              {localError && <p>{localError}</p>}
              {taskStore.error && <p>{taskStore.error}</p>}
            </div>
          )}
        </form>
      </Modal>
    </main>
  );
}