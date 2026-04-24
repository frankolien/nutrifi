/**
 * Quick utility: push the oracle price manually.
 *
 *   yarn push-price [price]   # default: replay the bootstrap's initial_price / 2 (crashed state)
 *
 * Useful when the oracle has gone stale (max_staleness_seconds default is
 * 300s) and you just want to get back to a workable state without
 * spinning up the full pricefeed service.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { NutrifiLending } from "../target/types/nutrifi_lending";
import lendingIdl from "../target/idl/nutrifi_lending.json";

interface Bootstrap {
  cluster: string;
  lendingProgramId: string;
  oracle: string;
  params: { initialPrice: string };
}

function loadBootstrap(): Bootstrap {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", ".bootstrap.json"), "utf8"),
  );
}

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p.replace(/^~/, os.homedir()), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const boot = loadBootstrap();
  const arg = process.argv[2];
  const priceBn = arg
    ? new BN(arg)
    : new BN(boot.params.initialPrice).div(new BN(2)); // default: crashed state

  const connection = new Connection(boot.cluster, "confirmed");
  const admin = loadKeypair(
    process.env.WALLET_PATH ?? path.join(os.homedir(), ".config/solana/id.json"),
  );
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program<NutrifiLending>(
    lendingIdl as unknown as NutrifiLending,
    provider,
  );

  const oraclePda = new PublicKey(boot.oracle);
  const sig = await program.methods
    .setPrice(priceBn)
    .accountsStrict({
      authority: admin.publicKey,
      oracle: oraclePda,
    })
    .rpc();
  console.log(`oracle price set to ${priceBn.toString()}  tx=${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
