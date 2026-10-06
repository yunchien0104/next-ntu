"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FeatureHeader } from "@/components/ui/FeatureHeader";
import { Field, inputClass, Modal } from "@/components/ui/Modal";
import { initialCalendarEvents } from "@/lib/data";
import { usePersistentState } from "@/lib/storage";
import type { CalendarEvent } from "@/lib/types";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function CalendarPage({ notify, draftTitle, onDraftConsumed }: { notify: (message: string) => void; draftTitle?: string; onDraftConsumed: () => void }) {
  const [events, setEvents] = usePersistentState<CalendarEvent[]>("next-ntu-calendar-events", initialCalendarEvents);
  const [cursor, setCursor] = useState(new Date(2026, 9, 1));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: "2026-10-06", time: "10:00", guests: "", notes: "" });

  useEffect(() => {
    if (!draftTitle) return;
    setForm({ title: draftTitle, date: "2026-10-20", time: "10:00", guests: "", notes: "想了解你的學習／職涯路徑，預計 20–30 分鐘。" });
    setModalOpen(true);
    onDraftConsumed();
  }, [draftTitle, onDraftConsumed]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, key: dateKey(date), outside: date.getMonth() !== month };
    });
  }, [cursor]);

  function open(date = "2026-10-06") {
    setForm({ title: "", date, time: "10:00", guests: "", notes: "" });
    setModalOpen(true);
  }

  function save(event: FormEvent, google = false) {
    event.preventDefault();
    if (!form.title.trim() || !form.date) return notify("請填寫任務名稱與日期");
    const guests = form.guests.split(",").map((item) => item.trim()).filter(Boolean);
    if (guests.some((email) => !/^\S+@gmail\.com$/i.test(email))) return notify("協作者請輸入有效的 Gmail 帳號");
    const item: CalendarEvent = { id: `event-${Date.now()}`, ...form, guests: guests.join(","), type: guests.length ? "shared" : "" };
    setEvents((items) => [...items, item]);
    setModalOpen(false);
    notify("任務已加入日曆");
    if (google) {
      const compact = form.date.replaceAll("-", "");
      const start = `${compact}T${form.time.replace(":", "")}00`;
      const endDate = new Date(`${form.date}T${form.time}:00`); endDate.setHours(endDate.getHours() + 1);
      const end = `${dateKey(endDate).replaceAll("-", "")}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
      const params = new URLSearchParams({ action: "TEMPLATE", text: form.title, dates: `${start}/${end}`, details: form.notes || "由 Next@NTU 建立" });
      guests.forEach((email) => params.append("add", email));
      window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener");
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)]">
      <FeatureHeader eyebrow="PLAN & COLLABORATE" title={`${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`} description="把 AI 建議、申請截止日與協作任務放進同一個時間軸。" actions={<><Button variant="primary" onClick={() => open()}>＋ 建立任務</Button><Button onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>←</Button><Button onClick={() => setCursor(new Date(2026, 9, 1))}>今天</Button><Button onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>→</Button><Button variant="primary" onClick={() => window.open("https://calendar.google.com/calendar/u/0/r", "_blank", "noopener")}>Google Calendar ↗</Button></>} />
      <div className="grid min-h-[680px] lg:grid-cols-[230px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] p-5 lg:border-r lg:border-b-0">
          <Button variant="primary" full onClick={() => open()}>＋ 建立任務</Button>
          <h2 className="mt-7 text-xs font-semibold">我的日曆</h2>
          <div className="mt-3 space-y-3 text-xs text-[var(--muted)]"><label className="flex items-center gap-2"><span className="h-2 w-2 bg-[var(--paper)]" />我的任務</label><label className="flex items-center gap-2"><span className="h-2 w-2 bg-[#777]" />協作任務</label><label className="flex items-center gap-2"><span className="h-2 w-2 bg-[#333] ring-1 ring-[#777]" />生涯截止日</label></div>
          <p className="mt-7 border border-[var(--line)] p-3 text-[10px] leading-5 text-[var(--muted)]">加入 Gmail 協作者後，系統會把來賓帶入 Google Calendar 建立頁；由你確認送出邀請，網站不會取得你的 Google 密碼。</p>
        </aside>
        <section className="min-w-0 overflow-x-auto p-3 md:p-5">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-t border-l border-[var(--line)]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="border-r border-b border-[var(--line)] p-2 text-center font-mono text-[9px] text-[var(--muted)]">{day}</span>)}</div>
            <div className="grid grid-cols-7 border-l border-[var(--line)]">
              {cells.map((cell) => (
                <button key={cell.key} className={`min-h-24 border-r border-b border-[var(--line)] p-2 text-left align-top transition hover:bg-[var(--panel-2)] ${cell.outside ? "opacity-30" : ""} ${cell.key === "2026-10-06" ? "bg-[var(--panel)]" : ""}`} onClick={() => open(cell.key)}>
                  <span className={`grid h-6 w-6 place-items-center text-[10px] ${cell.key === "2026-10-06" ? "bg-[var(--paper)] text-[var(--paper-ink)]" : "text-[var(--muted)]"}`}>{cell.date.getDate()}</span>
                  <span className="mt-1 grid gap-1">{events.filter((item) => item.date === cell.key).map((item) => <span key={item.id} title={item.title} className={`truncate px-1.5 py-1 text-[9px] ${item.type === "shared" ? "bg-[#666] text-white" : item.type === "career" ? "border border-[#666] bg-[#242424] text-[#ddd]" : "bg-[var(--paper)] text-[var(--paper-ink)]"}`}>{item.time} {item.title}</span>)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <Modal open={modalOpen} title="建立日曆任務" onClose={() => setModalOpen(false)} footer={<><Button onClick={(event) => save(event, false)}>只加入 Next@NTU</Button><Button variant="primary" onClick={(event) => save(event, true)}>加入並帶到 Google</Button></>}>
        <form className="space-y-4" onSubmit={(event) => save(event, false)}>
          <Field label="任務名稱"><input className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：Coffee chat with Amy" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="日期"><input className={inputClass} type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="時間"><input className={inputClass} type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></Field></div>
          <Field label="邀請協作者（Gmail，可用逗號分隔）"><input className={inputClass} value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} placeholder="teammate@gmail.com" /></Field>
          <Field label="說明"><input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="議程、準備資料或會議連結" /></Field>
        </form>
      </Modal>
    </main>
  );
}
