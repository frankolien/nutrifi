/**
 * Number formatting helpers.
 *
 * Every displayed number routes through here. Two reasons:
 *   1. Consistency — $1,234.56 everywhere, never $1234.56 or $1,234.6.
 *   2. Swap-ability — when we later accept BN inputs from the chain,
 *      we change this one file, not 40 components.
 */

export function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatToken(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Compact "$47.2M" style for big aggregate numbers. */
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${formatUsd(value)}`;
}

/** Shorten a pubkey: "7xKq...aB3f". */
export function shortAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Relative time — "2m ago", "3h ago", "1d ago". */
export function relativeTime(tsSec: number, nowSec = Date.now() / 1000): string {
  const delta = Math.max(0, Math.floor(nowSec - tsSec));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}
