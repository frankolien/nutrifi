/**
 * Mint nSOL to an arbitrary wallet on localnet.
 *
 *   yarn mint-nsol-to <pubkey> [amount_nsol]     # default 100 nSOL
 *
 * Also airdrops 5 SOL to cover rent + fees if the target's balance is low.
 *
 * Why this exists: to exercise `deposit_collateral` + `borrow` from the web
 * UI, the connected wallet needs nSOL in an ATA. The staking program isn't
 * wired into the UI yet, so we mint directly from the admin wallet (which
 * owns the nsol mint authority via `createMint` in bootstrap-market.ts).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";

interface Bootstrap {
  cluster: string;
  nsolMint: string;
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
  const targetArg = process.argv[2];
  if (!targetArg) throw new Error("usage: yarn mint-nsol-to <pubkey> [amount_nsol]");
  const target = new PublicKey(targetArg);
  const amountNsol = Number(process.argv[3] ?? "100");
  if (!Number.isFinite(amountNsol) || amountNsol <= 0) {
    throw new Error("amount must be a positive number of nSOL");
  }
  const amountLamports = BigInt(Math.round(amountNsol * 1_000_000_000));

  const connection = new Connection(boot.cluster, "confirmed");
  const admin = loadKeypair(
    process.env.WALLET_PATH ?? path.join(os.homedir(), ".config/solana/id.json"),
  );
  const nsolMint = new PublicKey(boot.nsolMint);

  console.log(`target:  ${target.toBase58()}`);
  console.log(`mint:    ${nsolMint.toBase58()}`);
  console.log(`amount:  ${amountNsol} nSOL`);

  // Airdrop SOL if the target is nearly empty (needed for ATA rent + tx fees).
  const balance = await connection.getBalance(target);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log(`\nairdropping 5 SOL for fees / rent…`);
    const sig = await connection.requestAirdrop(target, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // Create ATA (paid for by admin, owned by target).
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    nsolMint,
    target,
  );
  console.log(`ATA:     ${ata.address.toBase58()}`);

  await mintTo(connection, admin, nsolMint, ata.address, admin, amountLamports);
  const after = await getAccount(connection, ata.address);
  console.log(`\nbalance: ${Number(after.amount) / 1e9} nSOL`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
