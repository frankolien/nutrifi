import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * StatCell — a labeled number.
 *
 *   eyebrow label (11px, uppercase, mono, muted)
 *   value (28px, Inter 600)
 *   optional sub (12px, mono, muted)
 *
 * Used in the 4-cell grid, the bottom stats strip, the Stake page
 * balance summary, etc. Always the same proportions.
 */
interface StatCellProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "neutral" | "accent" | "alert";
  className?: string;
  padding?: "sm" | "md";
}

const accentClasses = {
  neutral: "text-fg",
  accent: "text-accent",
  alert: "text-alert",
};

export function StatCell({
  label,
  value,
  sub,
  accent = "neutral",
  className,
  padding = "md",
}: StatCellProps) {
  return (
    <div className={cx(padding === "md" ? "p-6" : "p-4", className)}>
      <div className="eyebrow mb-3">{label}</div>
      <div
        className={cx(
          "num text-2xl font-medium leading-none",
          accentClasses[accent],
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="num text-xs text-fg-muted mt-2">{sub}</div>
      )}
    </div>
  );
}
