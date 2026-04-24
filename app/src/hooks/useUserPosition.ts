/**
 * Live on-chain data hook. Returns the `UserPosition` + `PriceSnapshot`
 * shapes the UI was already built against, plus real wallet balances
 * and the raw Market for downstream components (protocol stats, live APR).
 *
 * One query fetches everything in a single RPC round-trip:
 *   - Market                (for borrow_index + risk params)
 *   - UserLoan              (collateral + scaled_debt)
 *   - MockOracle            (current price)
 *   - wallet SOL            (System account lamports)
 *   - wallet nSOL ATA       (token balance)
 *   - wallet USDC ATA       (token balance)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, AccountLayout } from "@solana/spl-token";

import {
  CONFIG,
  NSOL_DECIMALS,
  PRICE_PRECISION,
  USDC_DECIMALS,
  USER_LOAN_SEED,
} from "@/lib/config";
import {
  decodeMarket,
  decodeMockOracle,
  decodeUserLoan,
  Market,
  nominalDebt,
} from "@/lib/chain/decode";
import { loadDevKeypair } from "@/lib/chain/devSigner";
import type { PriceSnapshot, UserPosition } from "@/types";

export interface LivePosition {
  position: UserPosition;
  prices: PriceSnapshot;
  market: Market;
  walletBalances: {
    solLamports: bigint;
    nsolLamports: bigint;
    usdcLamports: bigint;
  };
  raw: {
    hasLoan: boolean;
    collateralLamports: bigint;
    debtUsdcLamports: bigint;
    oraclePrice: bigint;
  };
}

const NSOL_DIVISOR = Number(10n ** BigInt(NSOL_DECIMALS));
const USDC_DIVISOR = Number(10n ** BigInt(USDC_DECIMALS));
const PRICE_DIVISOR = Number(PRICE_PRECISION);

function decodeTokenAmount(data: Uint8Array): bigint {
  // SPL Token account layout: amount is at bytes 64..72 as little-endian u64.
  const decoded = AccountLayout.decode(data);
  return decoded.amount;
}

export function useUserPosition() {
  const { connection } = useConnection();
  const { publicKey: walletPubkey } = useWallet();
  const devKey = useMemo(() => loadDevKeypair(), []);
  const publicKey = devKey?.publicKey ?? walletPubkey;

  return useQuery<LivePosition | null>({
    queryKey: ["user-position", publicKey?.toBase58() ?? null],
    enabled: !!publicKey,
    queryFn: async () => {
      if (!publicKey) return null;

      const [userLoanPda] = PublicKey.findProgramAddressSync(
        [USER_LOAN_SEED, publicKey.toBuffer()],
        CONFIG.lendingProgramId,
      );
      const nsolAta = getAssociatedTokenAddressSync(
        CONFIG.collateralMint,
        publicKey,
      );
      const usdcAta = getAssociatedTokenAddressSync(CONFIG.debtMint, publicKey);

      const [marketInfo, loanInfo, oracleInfo, solInfo, nsolInfo, usdcInfo] =
        await connection.getMultipleAccountsInfo([
          CONFIG.market,
          userLoanPda,
          CONFIG.oracle,
          publicKey,
          nsolAta,
          usdcAta,
        ]);

      if (!marketInfo)
        throw new Error(
          "market account not found — is the lending program deployed?",
        );
      if (!oracleInfo) throw new Error("oracle account not found");

      const market = decodeMarket(marketInfo.data);
      const oracle = decodeMockOracle(oracleInfo.data);

      // USD-per-nSOL derivation from on-chain price:
      //   oracle.price = USDC-lamports per nSOL-lamport × PRICE_PRECISION
      //   usd_per_nsol = price * 1e9 / (PRICE_PRECISION * 1e6)
      const usdPerNsol =
        (Number(oracle.price) * NSOL_DIVISOR) / (PRICE_DIVISOR * USDC_DIVISOR);

      const walletBalances = {
        solLamports: solInfo ? BigInt(solInfo.lamports) : 0n,
        nsolLamports: nsolInfo ? decodeTokenAmount(nsolInfo.data) : 0n,
        usdcLamports: usdcInfo ? decodeTokenAmount(usdcInfo.data) : 0n,
      };

      // User has no loan PDA yet — empty position but real wallet balances.
      if (!loanInfo) {
        return {
          position: {
            collateral: 0,
            debt: 0,
            rewards: 0,
            walletSol: Number(walletBalances.solLamports) / LAMPORTS_PER_SOL,
          },
          prices: priceSnapshot(usdPerNsol),
          market,
          walletBalances,
          raw: {
            hasLoan: false,
            collateralLamports: 0n,
            debtUsdcLamports: 0n,
            oraclePrice: oracle.price,
          },
        };
      }

      const loan = decodeUserLoan(loanInfo.data);
      const debtLamports = nominalDebt(loan.scaledDebt, market.borrowIndex);

      return {
        position: {
          collateral: Number(loan.collateral) / NSOL_DIVISOR,
          debt: Number(debtLamports) / USDC_DIVISOR,
          rewards: 0, // staking program not initialized; stays 0 until wired
          walletSol: Number(walletBalances.solLamports) / LAMPORTS_PER_SOL,
        },
        prices: priceSnapshot(usdPerNsol),
        market,
        walletBalances,
        raw: {
          hasLoan: true,
          collateralLamports: loan.collateral,
          debtUsdcLamports: debtLamports,
          oraclePrice: oracle.price,
        },
      };
    },
  });
}

function priceSnapshot(usdPerNsol: number): PriceSnapshot {
  return {
    sol: usdPerNsol,
    nsol: usdPerNsol,
    usdc: 1.0,
    nut: 0.0824, // staking not initialized — placeholder
  };
}
