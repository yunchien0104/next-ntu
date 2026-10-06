"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ProductPage } from "@/lib/types";

const navigation: Array<[ProductPage, string]> = [
  ["coach", "AI Coach"],
  ["calendar", "日曆"],
  ["columns", "專欄"],
  ["talent", "人才庫"],
  ["resume", "修履歷"],
];

const pageTitles: Record<ProductPage, string> = {
  coach: "大三實習 × 研究所雙軌規劃",
  calendar: "日曆與協作任務",
  columns: "校園專欄",
  talent: "人才庫",
  resume: "AI 履歷工作室",
};

export function TopBar({ activePage, onPageChange, onProfile, onSettings }: { activePage: ProductPage; onPageChange: (page: ProductPage) => void; onProfile: () => void; onSettings: () => void }) {
  return (
    <header className="sticky top-0 z-40 grid min-h-14 grid-cols-[auto_1fr_auto] items-center border-b border-[var(--line)] bg-[color:var(--bg)]/95 px-3 backdrop-blur md:grid-cols-[250px_auto_1fr_auto] md:px-4">
      <div className="flex items-center gap-2.5 pr-3">
        <img className="h-8 w-8 object-contain" src="/next-at-ntu-logo.png" alt="Next@NTU logo" />
        <strong className="hidden tracking-[-.03em] sm:block">Next@NTU</strong>
        <span className="hidden font-mono text-[9px] tracking-[.14em] text-[var(--muted)] lg:block">BETA</span>
      </div>
      <nav className="flex min-w-0 items-center overflow-x-auto" aria-label="主要功能">
        {navigation.map(([page, label]) => (
          <button
            key={page}
            className={cn(
              "h-14 shrink-0 border-b-2 px-3 text-xs font-semibold transition",
              activePage === page ? "border-[var(--paper)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
            )}
            onClick={() => onPageChange(page)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="hidden min-w-0 items-center gap-2 px-5 text-xs text-[var(--muted)] xl:flex">
        <span>工作區</span><span>/</span><strong className="truncate font-medium text-[var(--text)]">{pageTitles[activePage]}</strong>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <span className="hidden border border-[var(--line)] px-2.5 py-2 font-mono text-[10px] text-[var(--soft)] 2xl:block">● 資料更新 2 小時前</span>
        <Button className="hidden sm:block" onClick={onProfile}>YC　個人檔案</Button>
        <Button className="px-2.5" onClick={onSettings} aria-label="設定" title="設定">⚙</Button>
      </div>
    </header>
  );
}
