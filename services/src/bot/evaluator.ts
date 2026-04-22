/**
 * Evaluator — turns raw loan records into a sorted list of liquidation
 * candidates, richest first.
 *
 * A "candidate" is a loan whose projected debt has crossed the
 * liquidation threshold plus the bot's configured safety buffer. The
 * buffer keeps us from racing the on-chain program: if we evaluate at
 * exactly 100% of threshold, a slightly-stale oracle could mean the
 * tx reverts with `AccountHealthy`. An extra 25 bps (0.25%) safety is
 * cheap insurance.
 */

import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import {
  evaluateLoan,
  LoanHealth,
  Market,
  MockOracle,
  UserLoan,
} from "../shared";
import { LoanRecord } from "./scanner";

export interface LiquidationCandidate {
  address: PublicKey;
  loan: UserLoan;
  health: LoanHealth;
}

export function findCandidates(
  loans: LoanRecord[],
  market: Market,
  oracle: MockOracle,
  nowSec: number,
  triggerBufferBps: BN,
): LiquidationCandidate[] {
  const out: LiquidationCandidate[] = [];
  for (const rec of loans) {
    const health = evaluateLoan(
      rec.loan,
      market,
      oracle,
      nowSec,
      triggerBufferBps,
    );
    if (health.isLiquidatable) {
      out.push({ address: rec.address, loan: rec.loan, health });
    }
  }
  // Sort by how deep underwater the loan is — high-debt-to-ceiling
  // positions get liquidated first. Ties broken by nominal debt so
  // larger positions go first (more fees per tx).
  out.sort((a, b) => {
    const byRatio = b.health.debtToCeilingBps.cmp(a.health.debtToCeilingBps);
    if (byRatio !== 0) return byRatio;
    return b.health.nominalDebt.cmp(a.health.nominalDebt);
  });
  return out;
}
