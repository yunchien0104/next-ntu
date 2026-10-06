import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export function Button({ variant = "ghost", full, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "min-h-9 border px-3 py-2 text-xs font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)] hover:bg-white",
        variant === "ghost" && "border-[var(--line-strong)] bg-transparent text-[var(--text)] hover:border-[#6b6b6b] hover:bg-[var(--panel-2)]",
        variant === "quiet" && "border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--text)]",
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
}
