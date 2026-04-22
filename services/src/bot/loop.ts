/**
 * Scan loop — the orchestrator.
 *
 * Each tick:
 *   1. Re-read Market + Oracle (their state drifts continuously).
 *   2. Scan all UserLoans.
 *   3. Pick liquidation candidates.
 *   4. Compute per-candidate repay amount.
 *   5. Liquidate (or log in dry-run).
 *
 * We re-read USDC balance after each successful liquidation — the
 * liquidator's inventory is the hard constraint once multiple
 * candidates queue up.
 */

import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Logger } from "pino";
import {
  NutrifiEnv,
  planRepayAmount,
  lendingPdas,
} from "../shared";
import { loadMarket, loadOracle, scanUserLoans } from "./scanner";
import { findCandidates } from "./evaluator";
import { executeLiquidation, getUsdcBalance } from "./executor";

export interface LoopDeps {
  env: NutrifiEnv;
  connection: Connection;
  wallet: Keypair;
  log: Logger;
}

export async function tick(deps: LoopDeps): Promise<void> {
  const { env, connection, wallet, log } = deps;
  const { market: marketAddr, oracle: oracleAddr, collateralVault } =
    lendingPdas(env.lendingProgramId, env.collateralMint);

  const [market, oracle, loans, usdcAtStart] = await Promise.all([
    loadMarket(connection, marketAddr),
    loadOracle(connection, oracleAddr),
    scanUserLoans(connection, env.lendingProgramId),
    getUsdcBalance(connection, wallet.publicKey, env.debtMint),
  ]);

  const nowSec = Math.floor(Date.now() / 1000);
  const triggerBuffer = new BN(env.botTriggerBufferBps);
  const candidates = findCandidates(
    loans,
    market,
    oracle,
    nowSec,
    triggerBuffer,
  );

  log.info(
    {
      loans: loans.length,
      candidates: candidates.length,
      usdc: usdcAtStart.toString(),
      price: oracle.price.toString(),
      paused: market.paused,
    },
    "scan complete",
  );

  if (candidates.length === 0) return;
  if (market.paused) {
    log.warn("market paused — skipping liquidations this tick");
    return;
  }
  if (usdcAtStart.isZero() && !env.botDryRun) {
    log.warn("liquidator has zero USDC — fund the bot before going live");
    return;
  }

  let usdc = usdcAtStart;
  const maxRepay = new BN(env.botMaxRepayBps);
  for (const candidate of candidates) {
    if (usdc.isZero() && !env.botDryRun) {
      log.warn("USDC exhausted this tick — stopping");
      break;
    }
    const repay = planRepayAmount(
      candidate.health.nominalDebt,
      market,
      maxRepay,
      usdc.isZero() ? candidate.health.nominalDebt : usdc,
    );

    const sig = await executeLiquidation(
      {
        env,
        connection,
        wallet,
        market,
        marketAddr,
        oracleAddr,
        collateralVault,
        log,
      },
      candidate,
      repay,
      env.botDryRun,
    ).catch((err) => {
      log.error(
        {
          borrower: candidate.address.toBase58(),
          err: (err as Error).message,
        },
        "liquidation failed — continuing with next candidate",
      );
      return null as string | null;
    });

    if (sig && !env.botDryRun) {
      usdc = usdc.sub(repay);
    }
  }
}
