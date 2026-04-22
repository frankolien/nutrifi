#!/usr/bin/env node
/**
 * Price-feed poster entrypoint.
 *
 * Run:
 *   yarn pricefeed           # dev (ts-node)
 *   yarn pricefeed:prod      # built
 *
 * Ctrl-C for clean shutdown.
 */

import {
  loadEnv,
  makeConnection,
  loadKeypair,
  lendingPdas,
  scopedLogger,
} from "../shared";
import { tick } from "./poster";

async function main(): Promise<void> {
  const env = loadEnv();
  const log = scopedLogger("pricefeed");
  const connection = makeConnection(env);
  const wallet = loadKeypair(env.walletPath);
  const { oracle } = lendingPdas(env.lendingProgramId, env.collateralMint);

  log.info(
    {
      rpc: env.rpcUrl,
      authority: wallet.publicKey.toBase58(),
      oracle: oracle.toBase58(),
      asset: env.coingeckoAssetId,
      intervalMs: env.priceFeedIntervalMs,
    },
    "pricefeed starting",
  );

  let stopping = false;
  let timer: NodeJS.Timeout | null = null;
  const shutdown = (signal: string) => {
    log.info({ signal }, "shutdown requested");
    stopping = true;
    if (timer) clearTimeout(timer);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Drive on a setTimeout chain rather than setInterval — avoids
  // overlapping invocations if one tick runs long (bad RPC, retry storm).
  const run = async () => {
    while (!stopping) {
      try {
        await tick({ env, connection, wallet, oracle, log });
      } catch (err) {
        log.error({ err: (err as Error).message }, "tick failed");
      }
      if (stopping) break;
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, env.priceFeedIntervalMs);
      });
    }
    log.info("pricefeed stopped");
  };
  await run();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err);
  process.exit(1);
});
