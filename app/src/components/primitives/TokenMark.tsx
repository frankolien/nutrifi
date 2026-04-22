import { cx } from "@/lib/cx";
import type { AssetSymbol } from "@/types";

/**
 * TokenMark — circular token glyph. We draw our own SVGs instead of
 * pulling a token-logo package; four assets, four small marks, no
 * third-party bloat.
 *
 * Each glyph is single-color on a transparent circle with a thin
 * ring — sits comfortably next to mono numbers without being louder
 * than the value it labels.
 */
interface TokenMarkProps {
  symbol: AssetSymbol;
  size?: number;
  className?: string;
}

export function TokenMark({ symbol, size = 20, className }: TokenMarkProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-full border border-border bg-fg/[0.04]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12">
        <Glyph symbol={symbol} />
      </svg>
    </span>
  );
}

function Glyph({ symbol }: { symbol: AssetSymbol }) {
  switch (symbol) {
    case "SOL":
      // Three angled bars — nods to the Solana mark without copying.
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M2 3.5 L 9 3.5 L 10 2" />
          <path d="M2 6 L 9 6 L 10 4.5" />
          <path d="M2 8.5 L 9 8.5 L 10 7" />
        </g>
      );
    case "nSOL":
      // "n" suggesting nested / staked SOL — same bars, marker dot.
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="10" cy="2.5" r="0.9" fill="currentColor" stroke="none" />
          <path d="M2 4 L 8 4 L 9 2.5" />
          <path d="M2 6.5 L 8 6.5 L 9 5" />
          <path d="M2 9 L 8 9 L 9 7.5" />
        </g>
      );
    case "USDC":
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="6" cy="6" r="4.2" />
          <path d="M6 2.5 V 9.5 M 4 4.5 q 0 1 2 1 q 2 0 2 1 q 0 1 -2 1 q -2 0 -2 1" />
        </g>
      );
    case "NUT":
      // Simple diamond — the reward token's standalone mark.
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M6 1.5 L 10.5 6 L 6 10.5 L 1.5 6 Z" />
          <path d="M4 6 L 6 3.5 L 8 6 L 6 8.5 Z" fill="currentColor" stroke="none" opacity="0.35" />
        </g>
      );
  }
}
