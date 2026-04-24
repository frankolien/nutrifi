/**
 * Pulls the signer's recent NutriFi-program txs off-chain:
 *
 *   1. `getSignaturesForAddress` on the user's UserLoan PDA — that PDA
 *      is touched by every deposit/borrow/repay/withdraw involving this
 *      wallet, so it's a cheap primary index.
 *   2. `getTransaction` for each sig, parse the `Program log:` lines to
 *      work out the action + amount.
 *
 * Limited to the last 10 sigs to keep RPC load small. Good enough for a
 * dashboard sidebar; a real "Activity" page would paginate.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { CONFIG, USER_LOAN_SEED } from "@/lib/config";
import { loadDevKeypair } from "@/lib/chain/devSigner";

export type ActivityKind =
  | "deposit"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidate"
  | "other";

export interface ActivityItem {
  signature: string;
  kind: ActivityKind;
  tsSec: number;
  /** Raw log summary, for display. */
  summary: string;
  /** Whether this tx succeeded. */
  success: boolean;
}

const KIND_PATTERNS: Array<{ kind: ActivityKind; re: RegExp }> = [
  { kind: "deposit", re: /Instruction:\s*DepositCollateral/ },
  { kind: "withdraw", re: /Instruction:\s*WithdrawCollateral/ },
  { kind: "borrow", re: /Instruction:\s*Borrow\b/ },
  { kind: "repay", re: /Instruction:\s*Repay\b/ },
  { kind: "liquidate", re: /Instruction:\s*Liquidate\b/ },
];

function classify(logs: string[]): { kind: ActivityKind; summary: string } {
  for (const { kind, re } of KIND_PATTERNS) {
    if (logs.some((l) => re.test(l))) {
      // Try to pull an amount / new_total out of the program's own log.
      const stateLog = logs.find(
        (l) =>
          l.startsWith("Program log: deposit:") ||
          l.startsWith("Program log: borrow:") ||
          l.startsWith("Program log: withdraw:") ||
          l.startsWith("Program log: repay:") ||
          l.startsWith("Program log: liquidate:"),
      );
      const summary = stateLog
        ? stateLog.replace(/^Program log:\s*/, "")
        : kind;
      return { kind, summary };
    }
  }
  return { kind: "other", summary: "other" };
}

export function useRecentActivity(limit = 10) {
  const { connection } = useConnection();
  const { publicKey: walletPk } = useWallet();
  const devKey = useMemo(() => loadDevKeypair(), []);
  const owner = devKey?.publicKey ?? walletPk;

  const userLoanPda = useMemo(() => {
    if (!owner) return null;
    const [pda] = PublicKey.findProgramAddressSync(
      [USER_LOAN_SEED, owner.toBuffer()],
      CONFIG.lendingProgramId,
    );
    return pda;
  }, [owner]);

  return useQuery<ActivityItem[]>({
    queryKey: ["recent-activity", owner?.toBase58() ?? null, limit],
    enabled: !!owner && !!userLoanPda,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!userLoanPda) return [];
      const sigs = await connection.getSignaturesForAddress(userLoanPda, {
        limit,
      });
      if (sigs.length === 0) return [];

      const txs = await connection.getTransactions(
        sigs.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 },
      );

      return sigs.map((s, i) => {
        const tx = txs[i];
        const logs = tx?.meta?.logMessages ?? [];
        const { kind, summary } = classify(logs);
        return {
          signature: s.signature,
          kind,
          tsSec: s.blockTime ?? 0,
          summary,
          success: !s.err,
        };
      });
    },
  });
}
