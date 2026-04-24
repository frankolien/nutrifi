/**
 * One-shot bootstrap: stand up a fresh NutriFi lending market against
 * whichever cluster `solana config` is pointed at (localnet by default).
 *
 *   yarn bootstrap
 *
 * Steps:
 *   1. Create nSOL mint (9 decimals) + mock USDC mint (6 decimals).
 *   2. Hand USDC mint authority to the `usdc-mint-auth` PDA so `borrow`
 *      can mint during user interactions.
 *   3. Call `initialize_oracle` with an initial SOL price.
 *   4. Call `initialize_market` with sensible default risk params.
 *   5. Write `.bootstrap.json` at repo root: the mint addresses and
 *      program IDs the services and web app need.
 *
 * Idempotency: re-running fails fast if the market PDA already exists.
 * To reset, relaunch `solana-test-validator --reset` and re-run.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";

import { NutrifiLending } from "../target/types/nutrifi_lending";
import lendingIdl from "../target/idl/nutrifi_lending.json";

const MARKET_SEED = Buffer.from("market");
const COLLATERAL_VAULT_SEED = Buffer.from("collat-vault");
const USDC_MINT_AUTH_SEED = Buffer.from("usdc-mint-auth");
const ORACLE_SEED = Buffer.from("oracle");

// Matches PRICE_PRECISION in programs/lending/src/constants.rs (1e6).
// For 9-decimal nSOL vs 6-decimal USDC at $150/SOL:
//   1 nSOL-lamport × price / PRICE_PRECISION = USDC-lamports
//   $150 * 1e6 USDC-lamports / 1e9 nSOL-lamports = 150 USDC-lamports per nSOL-lamport
//   scaled by PRICE_PRECISION: 150 * 1e6 / 1e9 * 1e6 = 150
const INITIAL_PRICE = new BN(150);
const MAX_STALENESS_SECONDS = new BN(300);

const MARKET_PARAMS = {
  borrowAprBps: new BN(500), // 5% APR
  loanToValueBps: new BN(7_500), // 75%
  liquidationThresholdBps: new BN(8_000), // 80%
  liquidationBonusBps: new BN(500), // 5%
  closeFactorBps: new BN(5_000), // 50%
};

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p.replace(/^~/, os.homedir()), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
  const walletPath =
    process.env.WALLET_PATH ?? path.join(os.homedir(), ".config/solana/id.json");

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(walletPath);
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program<NutrifiLending>(
    lendingIdl as unknown as NutrifiLending,
    provider,
  );

  console.log(`cluster: ${rpcUrl}`);
  console.log(`payer:   ${payer.publicKey.toBase58()}`);
  console.log(`program: ${program.programId.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`balance: ${(balance / 1e9).toFixed(4)} SOL\n`);
  if (balance < 0.1 * 1e9) {
    throw new Error("payer has < 0.1 SOL, airdrop first");
  }

  const [marketPda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED],
    program.programId,
  );
  const [collateralVaultPda] = PublicKey.findProgramAddressSync(
    [COLLATERAL_VAULT_SEED],
    program.programId,
  );
  const [usdcMintAuthPda] = PublicKey.findProgramAddressSync(
    [USDC_MINT_AUTH_SEED],
    program.programId,
  );

  const existingMarket = await connection.getAccountInfo(marketPda);
  if (existingMarket) {
    throw new Error(
      `market PDA ${marketPda.toBase58()} already exists — reset the validator (or use the existing market)`,
    );
  }

  console.log("1/4 creating nSOL mint (9 decimals)…");
  const nsolMint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority — a real deploy would be the staking program's PDA
    null,
    9,
  );
  console.log(`     nsol mint: ${nsolMint.toBase58()}`);

  console.log("2/4 creating mock USDC mint (6 decimals)…");
  const usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
  await setAuthority(
    connection,
    payer,
    usdcMint,
    payer,
    AuthorityType.MintTokens,
    usdcMintAuthPda,
  );
  console.log(`     usdc mint: ${usdcMint.toBase58()}`);
  console.log(`     authority -> ${usdcMintAuthPda.toBase58()} (PDA)`);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [ORACLE_SEED, nsolMint.toBuffer()],
    program.programId,
  );

  console.log("3/4 initialize_oracle…");
  const oracleSig = await program.methods
    .initializeOracle(INITIAL_PRICE, MAX_STALENESS_SECONDS)
    .accountsStrict({
      authority: payer.publicKey,
      collateralMint: nsolMint,
      oracle: oraclePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`     oracle: ${oraclePda.toBase58()}`);
  console.log(`     tx:     ${oracleSig}`);

  console.log("4/4 initialize_market…");
  const marketSig = await program.methods
    .initializeMarket(MARKET_PARAMS)
    .accountsStrict({
      authority: payer.publicKey,
      market: marketPda,
      collateralMint: nsolMint,
      debtMint: usdcMint,
      oracle: oraclePda,
      usdcMintAuthority: usdcMintAuthPda,
      collateralVault: collateralVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`     market: ${marketPda.toBase58()}`);
  console.log(`     vault:  ${collateralVaultPda.toBase58()}`);
  console.log(`     tx:     ${marketSig}`);

  const out = {
    cluster: rpcUrl,
    payer: payer.publicKey.toBase58(),
    stakingProgramId: "221frxT7k1xFtwd4y7iWimUxiBe97zdte61mX7NTkkt9",
    lendingProgramId: program.programId.toBase58(),
    nsolMint: nsolMint.toBase58(),
    usdcMint: usdcMint.toBase58(),
    market: marketPda.toBase58(),
    collateralVault: collateralVaultPda.toBase58(),
    usdcMintAuthority: usdcMintAuthPda.toBase58(),
    oracle: oraclePda.toBase58(),
    params: {
      initialPrice: INITIAL_PRICE.toString(),
      maxStalenessSeconds: MAX_STALENESS_SECONDS.toNumber(),
      borrowAprBps: MARKET_PARAMS.borrowAprBps.toNumber(),
      loanToValueBps: MARKET_PARAMS.loanToValueBps.toNumber(),
      liquidationThresholdBps: MARKET_PARAMS.liquidationThresholdBps.toNumber(),
      liquidationBonusBps: MARKET_PARAMS.liquidationBonusBps.toNumber(),
      closeFactorBps: MARKET_PARAMS.closeFactorBps.toNumber(),
    },
    bootstrappedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", ".bootstrap.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${path.relative(process.cwd(), outPath)}`);
  console.log("done — copy these into services/.env and app/.env as needed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
