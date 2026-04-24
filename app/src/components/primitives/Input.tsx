import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { TokenMark } from "./TokenMark";
import type { AssetSymbol } from "@/types";

/**
 * AmountInput — the canonical numeric field used in every action card.
 *
 * Structure:
 *   [ 1.2345                         ] [ ◈ SOL ] [ Max ]
 *   hint (left)                            Balance: 18.24 SOL (right)
 *
 * Focus state lifts a soft accent glow from behind — gives the field
 * the "active now" feeling Jupiter uses without resorting to color on
 * the field itself.
 */
interface AmountInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  tokenBadge: ReactNode;
  balanceLabel?: string;
  onMax?: () => void;
  /**
   * Max value in the user's units (whole tokens / USD). When provided
   * the 25/50/75/MAX chip row is rendered; the input is set to a
   * fraction of this number. Required for the chips — without it we'd
   * only show MAX.
   */
  maxValue?: number;
  hint?: ReactNode;
  error?: string;
}

const CHIP_FRACTIONS = [0.25, 0.5, 0.75] as const;

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      value,
      onChange,
      tokenBadge,
      balanceLabel,
      onMax,
      maxValue,
      hint,
      error,
      placeholder = "0.00",
      ...rest
    },
    ref,
  ) => {
    // Chips only make sense when we know both the ceiling and how to
    // set an arbitrary fraction of it. `onMax` alone gives us MAX; the
    // fractional chips also need the numeric cap.
    const showChips =
      !!onMax && typeof maxValue === "number" && isFinite(maxValue) && maxValue > 0;

    const setFraction = (frac: number) => {
      if (typeof maxValue !== "number") return;
      // Truncate rather than round so the chip never pushes above the
      // real balance (which the chain would then reject).
      const raw = maxValue * frac;
      const trimmed = Math.floor(raw * 1e6) / 1e6;
      onChange(String(trimmed));
    };

    return (
      <div>
        <div
          className={cx(
            "group/amt relative flex items-center gap-3 rounded-md border bg-fg/[0.02] px-4 h-16 transition-[border-color,box-shadow] duration-200",
            error
              ? "border-alert/60 shadow-[0_0_0_4px_rgba(212,102,90,0.10)]"
              : "border-border focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_rgba(107,191,138,0.10)] hover:border-border-strong",
          )}
        >
          <input
            ref={ref}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="num flex-1 min-w-0 text-3xl font-medium tabular-nums placeholder:text-fg-dim"
            {...rest}
          />
          <div className="flex items-center gap-2">{tokenBadge}</div>
        </div>

        {showChips ? (
          <div className="mt-2 flex items-center gap-1.5">
            {CHIP_FRACTIONS.map((frac) => (
              <button
                key={frac}
                type="button"
                onClick={() => setFraction(frac)}
                className="flex-1 text-2xs uppercase tracking-[0.12em] text-fg-muted hover:text-fg hover:bg-fg/[0.04] border border-border rounded h-7 transition-colors"
              >
                {Math.round(frac * 100)}%
              </button>
            ))}
            <button
              type="button"
              onClick={onMax}
              className="flex-1 text-2xs uppercase tracking-[0.12em] text-accent hover:text-accent hover:bg-accent/10 border border-accent/40 rounded h-7 transition-colors"
            >
              Max
            </button>
          </div>
        ) : onMax ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onMax}
              className="text-2xs uppercase tracking-[0.12em] text-accent hover:bg-accent/10 border border-accent/40 rounded h-7 px-3 transition-colors"
            >
              Max
            </button>
          </div>
        ) : null}

        {(balanceLabel || hint || error) && (
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className={cx(error ? "text-alert" : "text-fg-muted")}>
              {error ?? hint ?? ""}
            </span>
            {balanceLabel && (
              <span className="num text-fg-muted">{balanceLabel}</span>
            )}
          </div>
        )}
      </div>
    );
  },
);
AmountInput.displayName = "AmountInput";

/**
 * TokenBadge — pill with token mark + symbol.
 *
 * Used inside AmountInput's right slot. Can also be used standalone
 * anywhere we want to show a token label at list density.
 */
export function TokenBadge({ symbol }: { symbol: AssetSymbol }) {
  return (
    <span className="inline-flex items-center gap-2 h-8 pl-1.5 pr-3 border border-border rounded-full text-sm font-medium bg-fg/[0.02]">
      <TokenMark symbol={symbol} size={22} />
      {symbol}
    </span>
  );
}
