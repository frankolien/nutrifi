/**
 * Generic send-a-transaction hook.
 *
 * If `VITE_DEV_SIGNER_SECRET` is set (dev-only, localnet), signs with
 * that keypair directly — skips the browser wallet entirely. Useful
 * because browser wallets can't talk to http://127.0.0.1:8899.
 *
 * In production the dev signer is absent and we fall back to the
 * wallet adapter's `sendTransaction`.
 */

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { loadDevKeypair } from "@/lib/chain/devSigner";

export interface SendTxArgs {
  instructions: TransactionInstruction[];
  ensureAtasFor?: PublicKey[];
}

/** Effective signer: dev keypair if configured, else the wallet adapter. */
export function useActiveSigner(): {
  publicKey: PublicKey | null;
  isDev: boolean;
} {
  const wallet = useWallet();
  const dev = useMemo(() => loadDevKeypair(), []);
  if (dev) return { publicKey: dev.publicKey, isDev: true };
  return { publicKey: wallet.publicKey, isDev: false };
}

export function useSendTx() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const devKeypair = useMemo<Keypair | null>(() => loadDevKeypair(), []);

  return useMutation({
    mutationFn: async ({ instructions, ensureAtasFor }: SendTxArgs) => {
      const signerPubkey = devKeypair?.publicKey ?? wallet.publicKey;
      if (!signerPubkey) throw new Error("no signer available (connect a wallet or set VITE_DEV_SIGNER_SECRET)");

      const tx = new Transaction();

      if (ensureAtasFor?.length) {
        const atas = ensureAtasFor.map((mint) => ({
          mint,
          address: getAssociatedTokenAddressSync(mint, signerPubkey),
        }));
        const infos = await connection.getMultipleAccountsInfo(
          atas.map((a) => a.address),
        );
        for (let i = 0; i < atas.length; i++) {
          if (!infos[i]) {
            tx.add(
              createAssociatedTokenAccountIdempotentInstruction(
                signerPubkey,
                atas[i].address,
                signerPubkey,
                atas[i].mint,
              ),
            );
          }
        }
      }

      for (const ix of instructions) tx.add(ix);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = signerPubkey;

      const sim = await connection.simulateTransaction(tx);
      // eslint-disable-next-line no-console
      console.log("[sim]", sim.value);
      if (sim.value.err) {
        const logs = (sim.value.logs ?? []).join("\n");
        throw new Error(
          `Simulation failed: ${JSON.stringify(sim.value.err)}\n${logs}`,
        );
      }

      // Dev path: sign locally with the keypair and broadcast directly.
      if (devKeypair) {
        return await sendAndConfirmTransaction(connection, tx, [devKeypair], {
          commitment: "confirmed",
        });
      }

      // Production path: browser wallet.
      let sig: string;
      try {
        sig = await wallet.sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (e) {
        const inner = e as {
          error?: unknown;
          logs?: string[];
          message?: string;
        };
        // eslint-disable-next-line no-console
        console.error("[sendTx] wallet error:", inner, "logs:", inner?.logs);
        const innerMsg =
          (inner?.error as { message?: string })?.message ??
          (typeof inner?.error === "string" ? inner.error : null) ??
          inner?.message ??
          String(e);
        const logBlock = inner?.logs?.length ? `\n${inner.logs.join("\n")}` : "";
        throw new Error(`${innerMsg}${logBlock}`);
      }
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return sig;
    },
    onSuccess: () => {
      // Invalidate every query that reads chain state so the UI reflects
      // the post-tx world immediately.
      queryClient.invalidateQueries({ queryKey: ["user-position"] });
      queryClient.invalidateQueries({ queryKey: ["protocol-stats"] });
      queryClient.invalidateQueries({ queryKey: ["staking-state"] });
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
      queryClient.invalidateQueries({ queryKey: ["liquidation-opportunities"] });
    },
  });
}
