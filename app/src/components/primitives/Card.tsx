import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Card — the atomic surface. Hairline border, no shadow, no fill.
 *
 * Keep this dumb. Pages compose Card with their own headers/content
 * rather than Card supporting a header/body/footer prop soup.
 */
interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-md border border-border bg-surface/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Standard title row inside a card: eyebrow label, optional right slot. */
export function CardHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between px-6 pt-5 pb-4",
        className,
      )}
    >
      <span className="eyebrow">{title}</span>
      {right}
    </div>
  );
}
