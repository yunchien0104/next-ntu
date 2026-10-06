import type { ReactNode } from "react";

export function FeatureHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 border-b border-[var(--line)] px-5 py-6 md:flex-row md:items-end md:justify-between md:px-8">
      <div>
        <div className="font-mono text-[10px] font-bold tracking-[.16em] text-[var(--muted)]">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-.035em] md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
