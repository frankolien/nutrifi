/**
 * Typed env loader. One module, one source of truth — every service
 * imports `loadEnv()` instead of reading `process.env` directly, so a
 * missing/misshaped variable fails at startup with a clear error rather
 * than deep inside a transaction.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Commitment, PublicKey } from "@solana/web3.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export interface NutrifiEnv {
  rpcUrl: string;
  commitment: Commitment;
  walletPath: string;
  lendingProgramId: PublicKey;
  stakingProgramId: PublicKey;
  collateralMint: PublicKey;
  debtMint: PublicKey;
  coingeckoAssetId: string;
  priceFeedIntervalMs: number;
  botScanIntervalMs: number;
  botTriggerBufferBps: number;
  botMaxRepayBps: number;
  botDryRun: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Env ${name} must be a number, got "${v}"`);
  }
  return n;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return /^(1|true|yes)$/i.test(v.trim());
}

function parsePubkey(name: string): PublicKey {
  try {
    return new PublicKey(required(name));
  } catch (e) {
    throw new Error(`Env ${name} is not a valid base58 public key`);
  }
}

function parseCommitment(v: string | undefined): Commitment {
  const allowed: Commitment[] = ["processed", "confirmed", "finalized"];
  const picked = (v ?? "confirmed").trim() as Commitment;
  if (!allowed.includes(picked)) {
    throw new Error(
      `COMMITMENT must be one of ${allowed.join(", ")} — got "${v}"`,
    );
  }
  return picked;
}

export function loadEnv(): NutrifiEnv {
  const walletPath = required("WALLET_PATH");
  if (!fs.existsSync(walletPath)) {
    throw new Error(`WALLET_PATH does not exist: ${walletPath}`);
  }

  return {
    rpcUrl: required("RPC_URL"),
    commitment: parseCommitment(process.env.COMMITMENT),
    walletPath,
    lendingProgramId: parsePubkey("LENDING_PROGRAM_ID"),
    stakingProgramId: parsePubkey("STAKING_PROGRAM_ID"),
    collateralMint: parsePubkey("COLLATERAL_MINT"),
    debtMint: parsePubkey("DEBT_MINT"),
    coingeckoAssetId: process.env.COINGECKO_ASSET_ID?.trim() || "solana",
    priceFeedIntervalMs: optionalNumber("PRICEFEED_INTERVAL_MS", 30_000),
    botScanIntervalMs: optionalNumber("BOT_SCAN_INTERVAL_MS", 10_000),
    botTriggerBufferBps: optionalNumber("BOT_TRIGGER_BUFFER_BPS", 25),
    botMaxRepayBps: optionalNumber("BOT_MAX_REPAY_BPS", 5_000),
    botDryRun: optionalBool("BOT_DRY_RUN", true),
  };
}
