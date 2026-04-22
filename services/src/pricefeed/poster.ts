/**
 * Price-feed poster loop.
 *
 * Every `priceFeedIntervalMs`:
 *   1. Fetch USD price from CoinGecko.
 *   2. Convert to the on-chain scaled format.
 *   3. Compare to the current on-chain price — skip the tx if the
 *      change is below `MIN_CHANGE_BPS` (cuts fee spend in half during
 *      calm markets).
 *   4. Send `set_price` and log the signature.
 *
 * Collateral-decimal conversion:
 *
 *   The on-chain `price` is "USDC-lamports per one smallest collateral
 *   unit". nSOL has 9 decimals, USDC has 6, so:
 *
 *      on_chain_price = usd_price_per_nsol * 1e6 / 1e9
 *                     = usd_price_per_nsol / 1000
 *
 *   The generalised formula:
 *
 *      on_chain_price =
 *        usd_price
 *        * 10^(debt_decimals)          // USDC 6
 *        * PRICE_PRECISION (1e6)       // protocol scale
 *        / 10^(collateral_decimals)    // nSOL 9
 *        / 1                           // USD has no on-chain decimals
 *
 *   We hard-code nSOL=9 and USDC=6 here; change if you re-deploy with
 *   different decimals.
 */

import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { Logger } from "pino";

import {
  NutrifiEnv,
  decodeMockOracle,
  buildSetPriceIx,
  sendAndConfirm,
  PRICE_PRECISION,
} from "../shared";
import { fetchUsdPrice } from "./coingecko";
import { Keypair } from "@solana/web3.js";

const COLLATERAL_DECIMALS = 9; // nSOL
const DEBT_DECIMALS = 6; // USDC

/** Skip the tx if the new price is within this many bps of the old one. */
const MIN_CHANGE_BPS = 5;

/** Convert a USD float into the on-chain `u128` price. */
export function usdToOnChainPrice(usdPerCollateralWhole: number): BN {
  // Use a wider fixed-point intermediate to avoid float precision loss.
  // We scale USD up by 1e9 before integer math — gives us 9 decimal
  // places of headroom, more than enough given oracle precision is 1e6.
  const USD_SCALE = new BN(1_000_000_000);
  const usdScaled = new BN(
    Math.round(usdPerCollateralWhole * USD_SCALE.toNumber()),
  );

  // result = usd_scaled * 10^debt_decimals * PRICE_PRECISION
  //          / (USD_SCALE * 10^collateral_decimals)
  const numerator = usdScaled
    .mul(new BN(10).pow(new BN(DEBT_DECIMALS)))
    .mul(PRICE_PRECISION);
  const denom = USD_SCALE.mul(new BN(10).pow(new BN(COLLATERAL_DECIMALS)));
  return numerator.div(denom);
}

export interface PosterDeps {
  env: NutrifiEnv;
  connection: Connection;
  wallet: Keypair;
  oracle: PublicKey;
  log: Logger;
}

export async function readOraclePrice(
  connection: Connection,
  oracle: PublicKey,
): Promise<BN | null> {
  const acct = await connection.getAccountInfo(oracle);
  if (!acct) return null;
  return decodeMockOracle(acct.data).price;
}

/** Single tick: fetch + maybe post. Returns the tx signature, or null if skipped. */
export async function tick(deps: PosterDeps): Promise<string | null> {
  const { env, connection, wallet, oracle, log } = deps;

  const quote = await fetchUsdPrice(env.coingeckoAssetId, log);
  const target = usdToOnChainPrice(quote.usd);
  if (target.isZero()) {
    log.warn({ usd: quote.usd }, "computed zero on-chain price, skipping");
    return null;
  }

  const current = await readOraclePrice(connection, oracle);
  if (current && !current.isZero()) {
    // Percentage change in bps (|Δ| × 10_000 / current).
    const diff = current.sub(target).abs();
    const changeBps = diff.mul(new BN(10_000)).div(current).toNumber();
    if (changeBps < MIN_CHANGE_BPS) {
      log.debug(
        { current: current.toString(), target: target.toString(), changeBps },
        "price change below threshold, skipping",
      );
      return null;
    }
    log.info(
      { current: current.toString(), target: target.toString(), changeBps },
      "price moved — posting update",
    );
  } else {
    log.info({ target: target.toString() }, "no existing price — seeding");
  }

  const ix = buildSetPriceIx(
    {
      programId: env.lendingProgramId,
      authority: wallet.publicKey,
      oracle,
    },
    target,
  );
  return await sendAndConfirm(connection, wallet, [ix], log, {
    computeUnits: 60_000,
  });
}
