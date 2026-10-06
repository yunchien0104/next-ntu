"use client";

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="animate-rise fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 border border-[var(--line-strong)] bg-[var(--paper)] px-4 py-3 text-xs font-semibold text-[var(--paper-ink)] shadow-2xl" role="status">
      {message}
    </div>
  );
}
