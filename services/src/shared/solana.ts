/**
 * Solana connection + wallet bootstrap.
 *
 * One place to:
 *   - load a keypair from disk
 *   - create a shared Connection
 *   - build a minimal Anchor Wallet (no @solana/wallet-adapter baggage —
 *     we just need something that can sign on the server)
 */

import * as fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NutrifiEnv } from "./env";

export function loadKeypair(walletPath: string): Keypair {
  const raw = fs.readFileSync(walletPath, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

export function makeConnection(env: NutrifiEnv): Connection {
  return new Connection(env.rpcUrl, {
    commitment: env.commitment,
    // 90s confirmation timeout is lenient enough for devnet flake but
    // tight enough we don't wedge the scan loop.
    confirmTransactionInitialTimeout: 90_000,
  });
}

/** Minimal signer interface that Anchor's Provider accepts. */
export interface ServerWallet {
  publicKey: PublicKey;
  payer: Keypair;
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]>;
}

export function makeWallet(keypair: Keypair): ServerWallet {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: async (tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else {
        tx.partialSign(keypair);
      }
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) {
          tx.sign([keypair]);
        } else {
          tx.partialSign(keypair);
        }
      }
      return txs;
    },
  };
}
