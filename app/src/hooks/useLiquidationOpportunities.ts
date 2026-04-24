/**
 * Scan every `UserLoan` PDA for the lending program, decode it, compute
 * its health factor at the current oracle price, return the unhealthy
 * ones sorted by severity (lowest health factor first).
 *
 * This is the browser version of what the off-chain bot does in
 * `services/src/bot/scanner.ts`. `getProgramAccounts` doesn't scale past
 * a few thousand loans on a public RPC — fine for tutorial / demo use.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import {
  CONFIG,
  NSOL_DECIMALS,
  PRICE_PRECISION,
  USDC_DECIMALS,
} from "@/lib/config";
import {
  decodeMarket,
  decodeMockOracle,
  decodeUserLoan,
  USER_LOAN_DISCRIMINATOR,
  nominalDebt,
} from "@/lib/chain/decode";
import { loadDevKeypair } from "@/lib/chain/devSigner";

export interface Opportunity {
  borrower: PublicKey;
  userLoanPda: PublicKey;
  collateralNsol: number;
  debtUsdc: number;
  healthFactor: number;
  /** Max USDC the liquidator can repay in one tx (50% of outstanding). */
  maxRepayUsdc: number;
  /** nSOL the liquidator would seize at the 5% bonus. */
  seizeNsol: number;
  /** USD profit from the bonus. */
  estimatedProfitUsd: number;
}

const NSOL_DIVISOR = Number(10n ** BigInt(NSOL_DECIMALS));
const USDC_DIVISOR = Number(10n ** BigInt(USDC_DECIMALS));
const PRICE_DIVISOR = Number(PRICE_PRECISION);

export function useLiquidationOpportunities() {
  const { connection } = useConnection();
  const { publicKey: walletPk } = useWallet();
  const devKey = useMemo(() => loadDevKeypair(), []);
  const me = devKey?.publicKey ?? walletPk;

  return useQuery<Opportunity[]>({
    queryKey: ["liquidation-opportunities"],
    refetchInterval: 10_000,
    queryFn: async () => {
      // Pull market + oracle + all UserLoan accounts in parallel.
      const [marketInfo, oracleInfo, loans] = await Promise.all([
        connection.getAccountInfo(CONFIG.market),
        connection.getAccountInfo(CONFIG.oracle),
        connection.getProgramAccounts(CONFIG.lendingProgramId, {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(USER_LOAN_DISCRIMINATOR),
              },
            },
          ],
        }),
      ]);
      if (!marketInfo || !oracleInfo) return [];
      const market = decodeMarket(marketInfo.data);
      const oracle = decodeMockOracle(oracleInfo.data);

      const usdPerNsol =
        (Number(oracle.price) * NSOL_DIVISOR) / (PRICE_DIVISOR * USDC_DIVISOR);
      const liqThreshold = Number(market.liquidationThresholdBps) / 10_000;
      const bonus = Number(market.liquidationBonusBps) / 10_000;
      const closeFactor = Number(market.closeFactorBps) / 10_000;

      const opps: Opportunity[] = [];
      for (const { account, pubkey } of loans) {
        const loan = decodeUserLoan(new Uint8Array(account.data));
        const collateralNsol = Number(loan.collateral) / NSOL_DIVISOR;
        const debtLamports = nominalDebt(loan.scaledDebt, market.borrowIndex);
        const debtUsdc = Number(debtLamports) / USDC_DIVISOR;
        if (debtUsdc <= 0 || collateralNsol <= 0) continue;

        const collateralValueUsd = collateralNsol * usdPerNsol;
        // health = (collateral × threshold) / debt
        const hf = (collateralValueUsd * liqThreshold) / debtUsdc;
        // Only show strictly-liquidatable positions; exclude the signer's own.
        if (hf >= 1) continue;
        if (me && loan.owner.equals(me)) continue;

        const maxRepayUsdc = debtUsdc * closeFactor;
        const seizeValueUsd = maxRepayUsdc * (1 + bonus);
        const seizeNsol = seizeValueUsd / usdPerNsol;
        const estimatedProfitUsd = seizeValueUsd - maxRepayUsdc;

        opps.push({
          borrower: loan.owner,
          userLoanPda: pubkey,
          collateralNsol,
          debtUsdc,
          healthFactor: hf,
          maxRepayUsdc,
          seizeNsol,
          estimatedProfitUsd,
        });
      }
      opps.sort((a, b) => a.healthFactor - b.healthFactor);
      return opps;
    },
  });
}
