/**
 * Health-factor math — the UI mirror.
 *
 * This is the same logic the on-chain program uses (see
 * `programs/lending/src/state/health.rs`) and the off-chain bot uses
 * (see `services/src/shared/health.ts`). Having three copies is ugly;
 * the alternative is sharing a package across Node/Rust/Browser which
 * is heavier than it's worth for a portfolio project.
 *
 * **If you change the risk parameters on-chain, update here.**
 */

import type { UserPosition, PriceSnapshot } from "@/types";

export const LTV_BPS = 7_500; // 75% — max borrow as a fraction of collateral
export const LIQUIDATION_THRESHOLD_BPS = 8_000; // 80%
export const BPS = 10_000;

export interface Health {
  /** Collateral × price, in USDC. */
  collateralValueUsd: number;
  /** LTV-adjusted max debt. */
  borrowLimitUsd: number;
  /** Debt / (collateral × threshold). >1 means liquidatable. */
  healthFactor: number;
  /** Current LTV as a fraction of borrow limit, for the horizontal bar. */
  utilization: number;
  /** Price of collateral (USD) at which the position is liquidatable. */
  liquidationPriceUsd: number;
}

export function evaluateHealth(
  position: UserPosition,
  prices: PriceSnapshot,
): Health {
  const collateralValueUsd = position.collateral * prices.nsol;
  const borrowLimitUsd =
    (collateralValueUsd * LTV_BPS) / BPS; // LTV-gated max debt

  // Health factor: debt / (collateral × liquidation_threshold).
  // > 1 = liquidatable. We invert so the displayed "1.34×" feels
  // natural ("you can lose 34% before getting liquidated"). Matches
  // the on-chain `debtToCeilingBps` logic expressed as a multiple.
  const ceilingUsd = (collateralValueUsd * LIQUIDATION_THRESHOLD_BPS) / BPS;
  const healthFactor =
    position.debt > 0 ? ceilingUsd / position.debt : Number.POSITIVE_INFINITY;

  const utilization =
    borrowLimitUsd > 0 ? Math.min(1, position.debt / borrowLimitUsd) : 0;

  // liq_price × collateral × threshold = debt → solve for liq_price
  const liquidationPriceUsd =
    position.debt > 0 && position.collateral > 0
      ? position.debt / ((position.collateral * LIQUIDATION_THRESHOLD_BPS) / BPS)
      : 0;

  return {
    collateralValueUsd,
    borrowLimitUsd,
    healthFactor,
    utilization,
    liquidationPriceUsd,
  };
}

export type HealthState = "healthy" | "caution" | "risk" | "liquidatable";

export function healthState(hf: number): HealthState {
  if (!Number.isFinite(hf) || hf >= 2) return "healthy";
  if (hf >= 1.3) return "caution";
  if (hf > 1) return "risk";
  return "liquidatable";
}
