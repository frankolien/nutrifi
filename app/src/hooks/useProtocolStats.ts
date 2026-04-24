/**
 * Wallet-independent protocol stats: reads Market + Oracle, exposes
 * the numbers the Dashboard "Protocol" strip and the Markets route need.
 *
 * Kept separate from `useUserPosition` so (a) the query runs whether
 * or not a wallet is connected, and (b) different routes can share the
 * same cache entry without fanning out per-wallet refetches.
 */

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";

import {
  CONFIG,
  NSOL_DECIMALS,
  PRICE_PRECISION,
  USDC_DECIMALS,
} from "@/lib/config";
import {
  decodeMarket,
  decodeMockOracle,
  Market,
  MockOracle,
  nominalDebt,
} from "@/lib/chain/decode";

export interface ProtocolStats {
  market: Market;
  oracle: MockOracle;
  /** nSOL deposited, converted to whole tokens. */
  totalCollateralNsol: number;
  /** USDC outstanding debt (nominal, i.e. scaled × borrow_index), whole tokens. */
  totalBorrowedUsdc: number;
  /** Collateral value in USDC at current oracle price. */
  tvlUsd: number;
  /** total_debt / collateral_value_at_80%_threshold. 0…1. */
  utilization: number;
  /** Borrow APR as a decimal fraction (e.g. 0.05). */
  borrowApr: number;
  /** Liquidation threshold as a decimal (e.g. 0.80). */
  liquidationThreshold: number;
  /** Loan-to-value cap as a decimal (e.g. 0.75). */
  loanToValue: number;
  /** USD per nSOL derived from oracle. */
  usdPerNsol: number;
}

const NSOL_DIVISOR = Number(10n ** BigInt(NSOL_DECIMALS));
const USDC_DIVISOR = Number(10n ** BigInt(USDC_DECIMALS));
const PRICE_DIVISOR = Number(PRICE_PRECISION);

export function useProtocolStats() {
  const { connection } = useConnection();

  return useQuery<ProtocolStats>({
    queryKey: ["protocol-stats"],
    queryFn: async () => {
      const [marketInfo, oracleInfo] = await connection.getMultipleAccountsInfo(
        [CONFIG.market, CONFIG.oracle],
      );
      if (!marketInfo) throw new Error("market not found");
      if (!oracleInfo) throw new Error("oracle not found");

      const market = decodeMarket(marketInfo.data);
      const oracle = decodeMockOracle(oracleInfo.data);

      const usdPerNsol =
        (Number(oracle.price) * NSOL_DIVISOR) / (PRICE_DIVISOR * USDC_DIVISOR);

      const totalCollateralNsol = Number(market.totalCollateral) / NSOL_DIVISOR;
      const totalBorrowedLamports = nominalDebt(
        market.totalScaledDebt,
        market.borrowIndex,
      );
      const totalBorrowedUsdc = Number(totalBorrowedLamports) / USDC_DIVISOR;
      const tvlUsd = totalCollateralNsol * usdPerNsol;
      const borrowApr = Number(market.borrowAprBps) / 10_000;
      const loanToValue = Number(market.loanToValueBps) / 10_000;
      const liquidationThreshold =
        Number(market.liquidationThresholdBps) / 10_000;

      // Utilization: debt vs. threshold-adjusted collateral value.
      // 0.0 = nothing borrowed, 1.0 = right at the liquidation wall.
      const utilizationCeiling = tvlUsd * liquidationThreshold;
      const utilization =
        utilizationCeiling > 0
          ? Math.min(1, totalBorrowedUsdc / utilizationCeiling)
          : 0;

      return {
        market,
        oracle,
        totalCollateralNsol,
        totalBorrowedUsdc,
        tvlUsd,
        utilization,
        borrowApr,
        loanToValue,
        liquidationThreshold,
        usdPerNsol,
      };
    },
  });
}
