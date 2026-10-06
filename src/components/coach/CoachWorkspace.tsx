"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TodoPanel } from "./TodoPanel";
import type { TodoItem } from "@/lib/types";

export function CoachWorkspace({ todos, setTodos, notify, onProfile }: { todos: TodoItem[]; setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>; notify: (message: string) => void; onProfile: () => void }) {
  const [title, setTitle] = useState("大三實習 × 研究所雙軌規劃");
  const [mobileView, setMobileView] = useState<"plan" | "coach">("coach");

  function addPlan(plan: string) {
    setTodos((items) => [{ id: `plan-${Date.now()}`, title: plan, due: "11/15", tag: "AI 建議", done: false }, ...items]);
    notify("已加入你的生涯待辦");
  }

  return (
    <main className="relative flex min-h-0 flex-1 overflow-hidden pb-12 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:pb-0">
      <aside className={`${mobileView === "plan" ? "flex" : "hidden"} min-h-0 w-full flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] lg:flex`}>
        <HistoryPanel onQuestion={(question) => { setTitle(question); setMobileView("coach"); notify("已開啟過去的提問"); }} notify={notify} />
        <TodoPanel todos={todos} setTodos={setTodos} notify={notify} />
      </aside>
      <div className={`${mobileView === "coach" ? "flex" : "hidden"} min-h-0 w-full flex-1 lg:flex`}><ChatPanel title={title} onTitleChange={setTitle} addPlan={addPlan} notify={notify} /></div>
      <nav className="fixed right-0 bottom-0 left-0 z-30 grid h-12 grid-cols-3 border-t border-[var(--line)] bg-[var(--panel)] lg:hidden"><button className={mobileView === "plan" ? "bg-[var(--paper)] text-[var(--paper-ink)]" : "text-[var(--muted)]"} onClick={() => setMobileView("plan")}>計畫</button><button className={mobileView === "coach" ? "bg-[var(--paper)] text-[var(--paper-ink)]" : "text-[var(--muted)]"} onClick={() => setMobileView("coach")}>AI Coach</button><button className="text-[var(--muted)]" onClick={onProfile}>檔案</button></nav>
    </main>
  );
}
