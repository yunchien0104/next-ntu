"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Theme } from "@/lib/types";

export function SettingsModal({ open, theme, onThemeChange, onClose, notify }: { open: boolean; theme: Theme; onThemeChange: (theme: Theme) => void; onClose: () => void; notify: (message: string) => void }) {
  return (
    <Modal open={open} title="設定" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>完成</Button>}>
      <div className="flex items-center justify-between gap-4"><span className="text-sm">介面顏色</span><div className="flex border border-[var(--line)]"><button className={`px-3 py-2 text-xs ${theme === "dark" ? "bg-[var(--paper)] text-[var(--paper-ink)]" : "text-[var(--muted)]"}`} onClick={() => onThemeChange("dark")}>深色</button><button className={`px-3 py-2 text-xs ${theme === "light" ? "bg-[var(--paper)] text-[var(--paper-ink)]" : "text-[var(--muted)]"}`} onClick={() => onThemeChange("light")}>淺色</button></div></div>
      <div className="flex items-center justify-between gap-4"><span className="text-sm">語言</span><div className="flex border border-[var(--line)]"><button className="bg-[var(--paper)] px-3 py-2 text-xs text-[var(--paper-ink)]">繁體中文</button><button className="px-3 py-2 text-xs text-[var(--muted)]" onClick={() => notify("英文介面將於下一版開放")}>English</button></div></div>
    </Modal>
  );
}
