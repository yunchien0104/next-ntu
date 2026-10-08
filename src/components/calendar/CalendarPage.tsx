"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import {
  Field,
  inputClass,
  Modal,
} from "@/components/ui/Modal";

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

// 使用 UTC 做日曆格子的日期計算，避免瀏覽器時區影響。
function monthFor(date: string): Date {
  const value = new Date(`${date}T00:00:00Z`);

  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      1
    )
  );
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function googleCalendarUrl(
  form: CalendarForm,
  guests: string[]
): string {
  // 明確將輸入的時間解讀為台灣時間。
  const start = new Date(
    `${form.date}T${form.time}:00+08:00`
  );

  // Google 活動預設為一小時，也能正確跨越午夜。
  const end = new Date(
    start.getTime() + 60 * 60 * 1000
  );

  const compact = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: form.title.trim(),
    dates: `${compact(start)}/${compact(end)}`,
    ctz: "Asia/Taipei",
    details: form.notes.trim() || "由 Next@NTU 建立",
  });

  guests.forEach((email) => params.append("add", email));

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

  const [form, setForm] = useState<CalendarForm>(
    () => emptyForm(getTaipeiToday())
  );

  const [submitting, setSubmitting] = useState(false);
  const [googleLink, setGoogleLink] = useState("");

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

  const blocked =
    !taskStore.ready ||
    taskStore.loading ||
    taskStore.busy ||
    submitting;

  // 網頁跨過午夜時，更新今天的標記。
  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(getTaipeiToday());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  // 從人才庫帶入 Coffee chat 草稿。
  useEffect(() => {
    if (
      !draftTitle ||
      submitting ||
      taskStore.busy
    ) {
      return;
    }

    const date = getTaipeiToday();

    setForm({
      ...emptyForm(date),
      title: draftTitle,
      notes:
        "想了解你的學習／職涯路徑，預計 20–30 分鐘。",
    });

    setCursor(monthFor(date));
    setModalOpen(true);
    onDraftConsumed();
  }, [
    draftTitle,
    onDraftConsumed,
    submitting,
    taskStore.busy,
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
        key: dateKey(date),
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

  function open(date = getTaipeiToday()) {
    if (blocked) return;

    setForm(emptyForm(date));
    setModalOpen(true);
  }

  function closeModal() {
    if (taskStore.busy || submittingRef.current) return;
    setModalOpen(false);
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

  async function save(google = false) {
    if (blocked || submittingRef.current) return;

    if (!formRef.current?.reportValidity()) return;

    if (!form.title.trim()) {
      notify("請填寫任務名稱");
      return;
    }

    const guests = [
      ...new Set(
        form.guests
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
      ),
    ];

    if (
      guests.some(
        (email) =>
          !/^[^\s@,]+@gmail\.com$/i.test(email)
      )
    ) {
      notify("協作者請輸入有效的 Gmail 帳號");
      return;
    }

    const start = new Date(
      `${form.date}T${form.time}:00+08:00`
    );

    if (Number.isNaN(start.getTime())) {
      notify("請填寫有效的日期與時間");
      return;
    }

    const submittedForm = { ...form };

    const url = google
      ? googleCalendarUrl(submittedForm, guests)
      : "";

    // 在點擊時先開啟分頁，避免等待儲存後被擋彈出視窗。
    let googleWindow: Window | null = null;

    if (google) {
      googleWindow = window.open("about:blank", "_blank");

      if (googleWindow) {
        googleWindow.opener = null;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const task = await taskStore.createTask({
        title: submittedForm.title.trim(),
        date: submittedForm.date,
        time: submittedForm.time,
        guests,
        notes: submittedForm.notes,
        source: "calendar",
      });

      if (!task) {
        googleWindow?.close();
        notify("新增失敗，請保留內容並重試");
        return;
      }

      setCursor(monthFor(task.date));
      setModalOpen(false);
      setForm(emptyForm(getTaipeiToday()));
      setGoogleLink(url);

      notify("已加入日曆與生涯待辦");

      if (googleWindow && !googleWindow.closed) {
        try {
          googleWindow.location.replace(url);
        } catch {
          googleWindow.close();
          notify("任務已儲存，請按頁面上的 Google 連結");
        }
      } else if (google) {
        notify("任務已儲存，請按頁面上的 Google 連結");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    void save(false);
  }

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
              onClick={() => open()}
            >
              ＋ 建立任務
            </Button>

            <Button onClick={() => changeMonth(-1)}>
              ←
            </Button>

            <Button onClick={goToday}>
              今天
            </Button>

            <Button onClick={() => changeMonth(1)}>
              →
            </Button>

            <Button
              variant="primary"
              onClick={() =>
                window.open(
                  "https://calendar.google.com/calendar/u/0/r",
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Google Calendar ↗
            </Button>
          </>
        }
      />

      {taskStore.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-3"
        >
          <p className="break-words text-xs text-[var(--soft)]">
            任務同步失敗：{taskStore.error}
          </p>

          <Button
            disabled={
              taskStore.loading ||
              taskStore.busy ||
              submitting
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

      {googleLink && (
        <div className="border-b border-[var(--line)] px-5 py-3 text-xs">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            開啟剛新增任務的 Google Calendar 建立頁 ↗
          </a>
        </div>
      )}

      <div className="grid min-h-[680px] lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] p-5 lg:border-r lg:border-b-0">
          <Button
            variant="primary"
            full
            disabled={blocked}
            onClick={() => open()}
          >
            ＋ 建立任務
          </Button>

          <h2 className="mt-7 text-xs font-semibold">
            我的日曆
          </h2>

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
            日曆與生涯待辦共用同一份任務。
            在待辦按 X 刪除後，日曆也會移除該項目。
            日期與時間以台灣時間為準。
          </p>

          <p className="mt-3 border border-[var(--line)] p-3 text-[10px] leading-5 text-[var(--muted)]">
            選擇「加入並帶到 Google」會開啟 Google Calendar
            建立頁，由你確認儲存與送出邀請。
            在 Next@NTU 刪除任務，不會刪除你另外儲存的 Google 活動。
          </p>
        </aside>

        <section className="min-w-0 overflow-x-auto p-3 md:p-5">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-t border-l border-[var(--line)]">
              {[
                "Sun",
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
              ].map((day) => (
                <span
                  key={day}
                  className="border-r border-b border-[var(--line)] p-2 text-center font-mono text-[9px] text-[var(--muted)]"
                >
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 border-l border-[var(--line)]">
              {cells.map((cell) => {
                const isToday = cell.key === today;
                const events = eventsByDate.get(cell.key) ?? [];

                return (
                  <button
                    key={cell.key}
                    type="button"
                    aria-label={`${cell.key}，${events.length} 個任務，點擊新增`}
                    disabled={blocked}
                    className={`flex min-h-24 min-w-0 flex-col items-stretch border-r border-b border-[var(--line)] p-2 text-left transition hover:bg-[var(--panel-2)] disabled:cursor-default ${
                      cell.outside ? "opacity-40" : ""
                    } ${
                      isToday ? "bg-[var(--panel)]" : ""
                    }`}
                    onClick={() => open(cell.key)}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center text-[10px] ${
                        isToday
                          ? "bg-[var(--paper)] text-[var(--paper-ink)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {cell.date.getUTCDate()}
                    </span>

                    <span className="mt-1 grid w-full min-w-0 gap-1">
                      {events.map((item) => (
                        <span
                          key={item.id}
                          title={`${item.time} ${item.title}${
                            item.done ? "（已完成）" : ""
                          }`}
                          className={`block truncate px-1.5 py-1 text-[9px] ${taskClass(
                            item
                          )} ${
                            item.done
                              ? "opacity-50 line-through"
                              : ""
                          }`}
                        >
                          {item.done ? "✓ " : ""}
                          {item.time} {item.title}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={modalOpen}
        title="建立日曆任務"
        onClose={closeModal}
        footer={
          <>
            <Button
              disabled={taskStore.busy || submitting}
              onClick={closeModal}
            >
              取消
            </Button>

            <Button
              disabled={blocked}
              onClick={() => void save(false)}
            >
              {submitting ? "儲存中…" : "只加入 Next@NTU"}
            </Button>

            <Button
              variant="primary"
              disabled={blocked}
              onClick={() => void save(true)}
            >
              加入並帶到 Google
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <fieldset
            disabled={submitting || taskStore.busy}
            className="space-y-4"
          >
            <Field label="任務名稱">
              <input
                className={inputClass}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
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
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
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
                    setForm((current) => ({
                      ...current,
                      time: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>

            <Field label="邀請協作者（Gmail，可用逗號分隔）">
              <input
                className={inputClass}
                value={form.guests}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    guests: event.target.value,
                  }))
                }
                placeholder="teammate@gmail.com"
              />
            </Field>

            <Field label="說明">
              <input
                className={inputClass}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="議程、準備資料或會議連結"
              />
            </Field>
          </fieldset>

          <p className="text-[10px] leading-5 text-[var(--muted)]">
            儲存後會同步加入生涯待辦，並依此日期與時間排序。
          </p>

          {taskStore.error && (
            <p
              role="alert"
              className="break-words text-xs leading-5 text-[var(--soft)]"
            >
              儲存未完成：{taskStore.error}
              <br />
              請檢查後再次按儲存按鈕。
            </p>
          )}
        </form>
      </Modal>
    </main>
  );
}