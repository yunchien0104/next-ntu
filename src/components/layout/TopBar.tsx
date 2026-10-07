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

interface TopBarProps {
  activePage: ProductPage;
  onPageChange: (page: ProductPage) => void;
  onProfile: () => void;
  onSettings: () => void;
}

export function TopBar({
  activePage,
  onPageChange,
  onProfile,
  onSettings,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 grid h-14 w-full min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-[var(--line)] bg-[color:var(--bg)]/95 px-2 backdrop-blur sm:px-3 xl:grid-cols-[250px_auto_minmax(0,1fr)_auto] xl:px-4">
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 pr-2 sm:pr-3">
        <img
          className="h-8 w-8 shrink-0 object-contain"
          src="/next-at-ntu-logo.png"
          alt="Next@NTU logo"
        />

        <strong className="hidden whitespace-nowrap tracking-[-.03em] sm:block">
          Next@NTU
        </strong>

        <span className="hidden font-mono text-[9px] tracking-[.14em] text-[var(--muted)] lg:block">
          BETA
        </span>
      </div>

      <nav
        className="col-start-2 row-start-1 flex min-w-0 items-center overflow-x-auto overscroll-x-contain"
        aria-label="主要功能"
      >
        {navigation.map(([page, label]) => (
          <button
            type="button"
            key={page}
            className={cn(
              "h-14 shrink-0 whitespace-nowrap border-b-2 px-3 text-xs font-semibold transition",
              activePage === page
                ? "border-[var(--paper)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            )}
            onClick={() => onPageChange(page)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="col-start-3 row-start-1 hidden min-w-0 items-center gap-2 overflow-hidden px-5 text-xs text-[var(--muted)] xl:flex">
        <span className="shrink-0">工作區</span>
        <span className="shrink-0">/</span>

        <strong className="truncate font-medium text-[var(--text)]">
          {pageTitles[activePage]}
        </strong>
      </div>

      <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-1 pl-2 sm:gap-2 xl:col-start-4">
        <span className="hidden whitespace-nowrap border border-[var(--line)] px-2.5 py-2 font-mono text-[10px] text-[var(--soft)] 2xl:block">
          ● 資料更新 2 小時前
        </span>

        <Button
          className="h-9 shrink-0 px-2 sm:px-3"
          onClick={onProfile}
          aria-label="個人檔案"
          title="個人檔案"
        >
          <span className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </svg>

            <span className="hidden whitespace-nowrap sm:inline">
              個人檔案
            </span>
          </span>
        </Button>

        <Button
          className="h-9 shrink-0 px-2.5"
          onClick={onSettings}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </Button>
      </div>
    </header>
  );
}