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
  hint?: ReactNode;
  error?: string;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      value,
      onChange,
      tokenBadge,
      balanceLabel,
      onMax,
      hint,
      error,
      placeholder = "0.00",
      ...rest
    },
    ref,
  ) => {
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
          <div className="flex items-center gap-2">
            {tokenBadge}
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="text-2xs uppercase tracking-[0.12em] text-fg-muted hover:text-fg px-2 py-1 rounded transition-colors"
              >
                Max
              </button>
            )}
          </div>
        </div>

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
