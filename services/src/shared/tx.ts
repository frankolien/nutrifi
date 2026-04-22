/**
 * Transaction send + confirm wrapper with basic retry + logging.
 *
 * Solana RPCs occasionally lie (blockhash not found, node behind, etc.).
 * We retry a handful of times with a fresh blockhash each attempt, and
 * surface the signature in logs so failed confirmations can be grepped
 * on an explorer.
 */

import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  SendOptions,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Logger } from "pino";

export interface SendOpts {
  /** Rough compute-unit ceiling — set per tx to avoid network default (200k) cuts. */
  computeUnits?: number;
  /** Micro-lamport priority fee per CU. 0 = none. */
  priorityFeeMicroLamports?: number;
  /** How many end-to-end attempts before giving up. */
  maxAttempts?: number;
}

export async function sendAndConfirm(
  connection: Connection,
  signer: Keypair,
  instructions: TransactionInstruction[],
  log: Logger,
  opts: SendOpts = {},
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const sendOptions: SendOptions = { skipPreflight: false, maxRetries: 3 };

  // Prepend compute-budget instructions if the caller asked for them.
  // Done once, not per-attempt — they're not blockhash-sensitive.
  const prelude: TransactionInstruction[] = [];
  if (opts.computeUnits) {
    prelude.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnits }),
    );
  }
  if (opts.priorityFeeMicroLamports && opts.priorityFeeMicroLamports > 0) {
    prelude.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: opts.priorityFeeMicroLamports,
      }),
    );
  }
  const allIxs = [...prelude, ...instructions];

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: signer.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(...allIxs);

      tx.sign(signer);
      const sig = await connection.sendRawTransaction(
        tx.serialize(),
        sendOptions,
      );
      log.debug({ sig, attempt }, "tx submitted, confirming…");

      const result = await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        connection.commitment,
      );
      if (result.value.err) {
        throw new Error(
          `tx ${sig} confirmed with error: ${JSON.stringify(result.value.err)}`,
        );
      }
      log.info({ sig }, "tx confirmed");
      return sig;
    } catch (err) {
      lastErr = err;
      log.warn(
        { attempt, err: (err as Error).message },
        "send failed, retrying",
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("sendAndConfirm exhausted retries");
}
