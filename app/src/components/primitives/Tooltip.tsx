import { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Tooltip — the `?` info icon with a hover/focus reveal.
 *
 * CSS-only (no portal / no positioner). Works on mouse hover and
 * keyboard focus. The bubble is absolutely positioned above the
 * trigger; long content is OK because `max-w-xs` clamps it.
 *
 * Usage:
 *   <Tooltip text="Your debt / (collateral × threshold). Below 1× liquidates.">
 *     Health factor
 *   </Tooltip>
 */
export function Tooltip({
  children,
  text,
  side = "top",
  className,
}: {
  children: ReactNode;
  text: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "relative inline-flex items-center gap-1 group cursor-help",
        className,
      )}
      tabIndex={0}
    >
      {children}
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-border text-[9px] text-fg-muted leading-none"
      >
        ?
      </span>
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 w-max max-w-xs",
          "rounded-md border border-border bg-surface px-3 py-2",
          "text-xs text-fg leading-snug shadow-xl",
          "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
          "group-focus-visible:opacity-100 group-focus-visible:visible",
          "transition-opacity",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {text}
      </span>
    </span>
  );
}
