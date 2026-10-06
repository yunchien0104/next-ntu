"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, children, onClose, footer, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-auto border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="quiet" onClick={onClose} aria-label="關閉">✕</Button>
        </header>
        <div className="space-y-4 p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] p-4">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs text-[var(--soft)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--paper)]";
