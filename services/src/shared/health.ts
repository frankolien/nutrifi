/**
 * Off-chain mirror of the on-chain health math.
 *
 * **Must** stay in lockstep with:
 *   - programs/lending/src/state/market.rs::accrue_interest
 *   - programs/lending/src/state/user_loan.rs::nominal_debt
 *   - programs/lending/src/state/health.rs
 *
 * If the bot's math diverges from the program's, it will either:
 *   - skip liquidations it should take (money left on the table), or
 *   - attempt liquidations that revert (wasted fees).
 *
 * We therefore use BN throughout and mirror the exact integer math.
 */

import BN from "bn.js";
import { Market, UserLoan, MockOracle } from "./decode";

// -- Scales (mirror programs/lending/src/constants.rs) --
export const BPS_DENOMINATOR = new BN(10_000);
export const PRICE_PRECISION = new BN(1_000_000);
export const INDEX_PRECISION = new BN("1000000000000000000"); // 1e18
export const SECONDS_PER_YEAR = new BN(31_536_000);

/** Advance a market's borrow index to `nowSec`, matching on-chain linear accrual. */
export function projectedBorrowIndex(market: Market, nowSec: number): BN {
  const last = market.lastUpdateTs.toNumber();
  if (nowSec <= last) return market.borrowIndex;
  const elapsed = new BN(nowSec - last);

  // delta_rate = apr_bps * elapsed * INDEX_PRECISION / (BPS * SECONDS_PER_YEAR)
  const numerator = market.borrowAprBps
    .mul(elapsed)
    .mul(INDEX_PRECISION);
  const denom = BPS_DENOMINATOR.mul(SECONDS_PER_YEAR);
  const deltaRate = numerator.div(denom);

  // growth = borrow_index * delta_rate / INDEX_PRECISION
  const growth = market.borrowIndex.mul(deltaRate).div(INDEX_PRECISION);
  return market.borrowIndex.add(growth);
}

/** Nominal debt at a projected index. */
export function nominalDebt(loan: UserLoan, borrowIndex: BN): BN {
  if (loan.scaledDebt.isZero()) return new BN(0);
  return loan.scaledDebt.mul(borrowIndex).div(INDEX_PRECISION);
}

/** Collateral value in debt-token units (USDC lamports). */
export function collateralValue(collateral: BN, price: BN): BN {
  return collateral.mul(price).div(PRICE_PRECISION);
}

/** Max tolerable debt before this account becomes liquidatable, in USDC lamports. */
export function liquidationCeiling(collateralVal: BN, thresholdBps: BN): BN {
  return collateralVal.mul(thresholdBps).div(BPS_DENOMINATOR);
}

export interface LoanHealth {
  nominalDebt: BN;
  collateralValue: BN;
  liquidationCeiling: BN;
  /**
   * Ratio of nominal debt to the liquidation ceiling, in bps.
   *   < 10_000 → healthy
   *   ≥ 10_000 → liquidatable
   *
   * Equivalent to the `health_factor` UIs usually display (1.0 = at
   * threshold) but expressed in bps so we stay in integer land.
   */
  debtToCeilingBps: BN;
  isLiquidatable: boolean;
}

/**
 * Full health snapshot for a loan. Uses the *projected* borrow index so
 * the bot sees a debt value consistent with what the on-chain
 * instruction will compute at execution time.
 */
export function evaluateLoan(
  loan: UserLoan,
  market: Market,
  oracle: MockOracle,
  nowSec: number,
  triggerBufferBps: BN,
): LoanHealth {
  const borrowIndex = projectedBorrowIndex(market, nowSec);
  const debt = nominalDebt(loan, borrowIndex);
  const collatVal = collateralValue(loan.collateral, oracle.price);
  const ceiling = liquidationCeiling(collatVal, market.liquidationThresholdBps);

  // Express debt/ceiling as bps. Guard against zero ceiling (zero
  // collateral) — treat as infinitely unhealthy.
  const debtToCeilingBps = ceiling.isZero()
    ? new BN(Number.MAX_SAFE_INTEGER)
    : debt.mul(BPS_DENOMINATOR).div(ceiling);

  const trigger = BPS_DENOMINATOR.add(triggerBufferBps);
  const isLiquidatable = !debt.isZero() && debtToCeilingBps.gte(trigger);

  return {
    nominalDebt: debt,
    collateralValue: collatVal,
    liquidationCeiling: ceiling,
    debtToCeilingBps,
    isLiquidatable,
  };
}

/**
 * Plan a repay amount.
 *
 * Bounded by:
 *   - the on-chain close factor (pulled from `market`)
 *   - the bot's configured cap (env `BOT_MAX_REPAY_BPS`)
 *   - the liquidator's actual USDC balance
 */
export function planRepayAmount(
  debt: BN,
  market: Market,
  maxRepayBps: BN,
  availableUsdc: BN,
): BN {
  const closeFactorCap = debt.mul(market.closeFactorBps).div(BPS_DENOMINATOR);
  const botCap = debt.mul(maxRepayBps).div(BPS_DENOMINATOR);
  let repay = BN.min(closeFactorCap, botCap);
  repay = BN.min(repay, availableUsdc);
  return repay;
}
