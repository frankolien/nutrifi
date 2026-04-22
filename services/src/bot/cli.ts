#!/usr/bin/env node
/**
 * Liquidation bot entrypoint.
 *
 * Run:
 *   yarn bot                 # dev (ts-node, dry-run by default)
 *   yarn bot:prod            # built
 *
 * To actually liquidate, set BOT_DRY_RUN=false in .env.
 */

import {
  loadEnv,
  makeConnection,
  loadKeypair,
  scopedLogger,
} from "../shared";
import { tick } from "./loop";

async function main(): Promise<void> {
  const env = loadEnv();
  const log = scopedLogger("bot");
  const connection = makeConnection(env);
  const wallet = loadKeypair(env.walletPath);

  log.info(
    {
      rpc: env.rpcUrl,
      liquidator: wallet.publicKey.toBase58(),
      lendingProgram: env.lendingProgramId.toBase58(),
      collateralMint: env.collateralMint.toBase58(),
      debtMint: env.debtMint.toBase58(),
      scanIntervalMs: env.botScanIntervalMs,
      triggerBufferBps: env.botTriggerBufferBps,
      maxRepayBps: env.botMaxRepayBps,
      dryRun: env.botDryRun,
    },
    "bot starting",
  );
  if (env.botDryRun) {
    log.warn("BOT_DRY_RUN=true — no transactions will be sent");
  }

  let stopping = false;
  let timer: NodeJS.Timeout | null = null;
  const shutdown = (signal: string) => {
    log.info({ signal }, "shutdown requested");
    stopping = true;
    if (timer) clearTimeout(timer);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (!stopping) {
    try {
      await tick({ env, connection, wallet, log });
    } catch (err) {
      log.error({ err: (err as Error).message }, "tick failed");
    }
    if (stopping) break;
    await new Promise<void>((resolve) => {
      timer = setTimeout(resolve, env.botScanIntervalMs);
    });
  }
  log.info("bot stopped");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err);
  process.exit(1);
});
