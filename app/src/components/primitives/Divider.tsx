import { cx } from "@/lib/cx";

/**
 * Divider — hairline rule. Used between sections where a full Card
 * feels too heavy.
 */
export function Divider({ className }: { className?: string }) {
  return <div className={cx("border-t border-border", className)} />;
}
