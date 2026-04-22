import { cx } from "@/lib/cx";

/**
 * SegmentedControl — pill toggle with a sliding indicator.
 *
 * Jupiter uses this for "Swap / Limit / DCA / VA" at the top of their
 * action card. We use it the same way for Stake/Unstake,
 * Deposit/Withdraw, Borrow/Repay. Visual rule: the active option
 * gets a filled neutral pill behind it; inactive options are muted
 * text. Never two accent colors — the control is chrome, not content.
 */
interface SegmentedControlProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  className?: string;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cx(
        "relative inline-flex p-1 rounded-md bg-fg/[0.04] border border-border",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              "relative z-10 rounded px-4 font-medium transition-colors",
              size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
              active
                ? "bg-fg/[0.08] text-fg"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
