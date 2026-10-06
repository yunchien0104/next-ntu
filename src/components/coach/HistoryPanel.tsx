"use client";

import { useState } from "react";
import { historyFolders, historyQuestions } from "@/lib/data";
import { cn } from "@/lib/cn";

export function HistoryPanel({ onQuestion, notify }: { onQuestion: (question: string) => void; notify: (message: string) => void }) {
  const [tab, setTab] = useState<"folders" | "questions">("folders");
  const [activeQuestion, setActiveQuestion] = useState(0);

  return (
    <section className="min-h-0 border-b border-[var(--line)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4">
        <div><div className="font-mono text-[9px] font-bold tracking-[.16em] text-[var(--muted)]">MEMORY</div><h2 className="text-sm font-semibold">提問紀錄</h2></div>
        <button className="grid h-8 w-8 place-items-center border border-[var(--line-strong)] text-sm hover:bg-[var(--panel-2)]" onClick={() => notify("開始一個新問題")} aria-label="新增問題">＋</button>
      </header>
      <div className="max-h-[34vh] overflow-y-auto p-3 lg:max-h-none">
        <div className="mb-3 grid grid-cols-2 gap-1">
          <button className={cn("border px-2 py-2 text-[10px]", tab === "folders" ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]" : "border-[var(--line)] text-[var(--muted)]")} onClick={() => setTab("folders")}>資料夾</button>
          <button className={cn("border px-2 py-2 text-[10px]", tab === "questions" ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]" : "border-[var(--line)] text-[var(--muted)]")} onClick={() => setTab("questions")}>所有問題</button>
        </div>
        {tab === "folders" ? (
          <div className="space-y-1.5">
            {historyFolders.map(([title, description, count]) => (
              <button key={title} className="grid w-full grid-cols-[28px_1fr_auto] items-center gap-2 border border-[var(--line)] bg-[var(--panel)] p-2.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--panel-2)]">
                <span className="text-[var(--soft)]">⌑</span><span><b className="block text-xs">{title}</b><span className="text-[9px] text-[var(--muted)]">{description}</span></span><i className="font-mono text-[9px] not-italic text-[var(--muted)]">{count}</i>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {historyQuestions.map(([question, meta], index) => (
              <button key={question} className={cn("w-full border p-2.5 text-left transition", activeQuestion === index ? "border-[#727272] bg-[var(--panel-2)]" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]")} onClick={() => { setActiveQuestion(index); onQuestion(question); }}>
                <b className="block text-xs leading-5">{question}</b><span className="text-[9px] text-[var(--muted)]">{meta}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
