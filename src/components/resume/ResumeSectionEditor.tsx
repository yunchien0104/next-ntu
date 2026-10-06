"use client";

import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import type { ResumeEntry, ResumeSection } from "@/lib/types";

const blankEntry = (): ResumeEntry => ({ organization: "", location: "", role: "", startDate: "", endDate: "", description: "" });

export function ResumeSectionEditor({ section, index, onChange, onDelete, onMoveUp }: { section: ResumeSection; index: number; onChange: (section: ResumeSection) => void; onDelete: () => void; onMoveUp: () => void }) {
  const labels = section.type === "education" ? { organization: "學校", role: "學位／主修" } : section.type === "skills" ? { organization: "分類", role: "內容" } : { organization: "公司／組織", role: "職稱／角色" };

  function updateEntry(entryIndex: number, key: keyof ResumeEntry, value: string) {
    onChange({ ...section, entries: section.entries.map((entry, current) => current === entryIndex ? { ...entry, [key]: value } : entry) });
  }

  return (
    <section className="border border-[var(--line)] bg-[var(--panel)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3"><input className="min-w-44 flex-1 bg-transparent text-sm font-semibold outline-none" value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} aria-label="區塊名稱" /><Button onClick={() => onChange({ ...section, entries: [...section.entries, blankEntry()] })}>＋ 新增一筆</Button><Button onClick={onMoveUp} disabled={index === 0} title="上移區塊">↑</Button><Button onClick={onDelete} title="刪除區塊">✕</Button></header>
      <div className="space-y-3 p-3">
        {section.entries.map((entry, entryIndex) => (
          <article key={entryIndex} className="border border-[var(--line)] bg-[var(--bg)] p-3">
            <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] text-[var(--muted)]">ENTRY {String(entryIndex + 1).padStart(2, "0")}</span><button className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]" onClick={() => onChange({ ...section, entries: section.entries.filter((_, current) => current !== entryIndex) })}>刪除這筆</button></div>
            {section.type === "skills" ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[10px] text-[var(--muted)]">{labels.organization}<input className={inputClass} value={entry.organization} onChange={(event) => updateEntry(entryIndex, "organization", event.target.value)} /></label><label className="grid gap-1 text-[10px] text-[var(--muted)]">{labels.role}<input className={inputClass} value={entry.description} onChange={(event) => updateEntry(entryIndex, "description", event.target.value)} /></label></div> : <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[10px] text-[var(--muted)]">{labels.organization}<input className={inputClass} value={entry.organization} onChange={(event) => updateEntry(entryIndex, "organization", event.target.value)} /></label><label className="grid gap-1 text-[10px] text-[var(--muted)]">城市／地點<input className={inputClass} value={entry.location} onChange={(event) => updateEntry(entryIndex, "location", event.target.value)} /></label><label className="grid gap-1 text-[10px] text-[var(--muted)]">{labels.role}<input className={inputClass} value={entry.role} onChange={(event) => updateEntry(entryIndex, "role", event.target.value)} /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-[10px] text-[var(--muted)]">開始日期<input className={inputClass} value={entry.startDate} onChange={(event) => updateEntry(entryIndex, "startDate", event.target.value)} placeholder="Sep 2025" /></label><label className="grid gap-1 text-[10px] text-[var(--muted)]">結束日期<input className={inputClass} value={entry.endDate} onChange={(event) => updateEntry(entryIndex, "endDate", event.target.value)} placeholder="Present" /></label></div><label className="grid gap-1 text-[10px] text-[var(--muted)] sm:col-span-2">內容（每行一點）<textarea className={`${inputClass} min-h-24`} value={entry.description} onChange={(event) => updateEntry(entryIndex, "description", event.target.value)} /></label></div>}
          </article>
        ))}
      </div>
    </section>
  );
}
