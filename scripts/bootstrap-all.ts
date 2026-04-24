/**
 * Unified bootstrap: stand up a fresh staking program AND a fresh
 * lending market that uses the staking program's nSOL as collateral.
 *
 *   yarn bootstrap-all
 *
 * Steps:
 *   1. Create nSOL mint (9 dec), transfer authority to the staking
 *      `nsol-mint-auth` PDA so only `stake`/`unstake` can mint/burn.
 *   2. Create NUT mint (9 dec), transfer authority to the staking
 *      `nut-mint-auth` PDA so only `claim_rewards` can mint.
 *   3. Call staking `initialize` with the reward rate.
 *   4. Create mock USDC mint (6 dec), transfer authority to the
 *      lending `usdc-mint-auth` PDA.
 *   5. Call lending `initialize_oracle` with an initial SOL price.
 *   6. Call lending `initialize_market` — collateral = the nSOL mint
 *      from step 1, debt = USDC from step 4.
 *   7. Write `.bootstrap.json` at repo root with everything.
 *
 * Idempotency: bails fast if either program's singleton PDA exists.
 * Reset with `solana-test-validator --reset` to start over.
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
import { NutrifiStaking } from "../target/types/nutrifi_staking";
import lendingIdl from "../target/idl/nutrifi_lending.json";
import stakingIdl from "../target/idl/nutrifi_staking.json";

// Seeds — must match programs/*/src/constants.rs
const MARKET_SEED = Buffer.from("market");
const COLLATERAL_VAULT_SEED = Buffer.from("collat-vault");
const USDC_MINT_AUTH_SEED = Buffer.from("usdc-mint-auth");
const ORACLE_SEED = Buffer.from("oracle");
const CONFIG_SEED = Buffer.from("config");
const SOL_VAULT_SEED = Buffer.from("sol-vault");
const NSOL_MINT_AUTH_SEED = Buffer.from("nsol-mint-auth");
const NUT_MINT_AUTH_SEED = Buffer.from("nut-mint-auth");

// Risk & price parameters.
const INITIAL_PRICE = new BN(150); // USDC-lamports per nSOL-lamport × PRICE_PRECISION, ~ $150/SOL
const MAX_STALENESS_SECONDS = new BN(300);
const MARKET_PARAMS = {
  borrowAprBps: new BN(500),
  loanToValueBps: new BN(7_500),
  liquidationThresholdBps: new BN(8_000),
  liquidationBonusBps: new BN(500),
  closeFactorBps: new BN(5_000),
};
// reward_rate: NUT per lamport per year, scaled by RATE_PRECISION (1e12).
// 10% APY-equivalent = 1e11 (i.e. 0.1 × RATE_PRECISION).
const REWARD_RATE = new BN("100000000000"); // 1e11

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

  const lending = new Program<NutrifiLending>(
    lendingIdl as unknown as NutrifiLending,
    provider,
  );
  const staking = new Program<NutrifiStaking>(
    stakingIdl as unknown as NutrifiStaking,
    provider,
  );

  console.log(`cluster:         ${rpcUrl}`);
  console.log(`payer:           ${payer.publicKey.toBase58()}`);
  console.log(`staking program: ${staking.programId.toBase58()}`);
  console.log(`lending program: ${lending.programId.toBase58()}\n`);

  const balance = await connection.getBalance(payer.publicKey);
  if (balance < 0.5 * 1e9) {
    throw new Error("payer has < 0.5 SOL, airdrop first");
  }

  // ---- Staking PDAs ----
  const [stakingConfigPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    staking.programId,
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [SOL_VAULT_SEED],
    staking.programId,
  );
  const [nsolMintAuthPda] = PublicKey.findProgramAddressSync(
    [NSOL_MINT_AUTH_SEED],
    staking.programId,
  );
  const [nutMintAuthPda] = PublicKey.findProgramAddressSync(
    [NUT_MINT_AUTH_SEED],
    staking.programId,
  );

  // ---- Lending PDAs ----
  const [marketPda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED],
    lending.programId,
  );
  const [collateralVaultPda] = PublicKey.findProgramAddressSync(
    [COLLATERAL_VAULT_SEED],
    lending.programId,
  );
  const [usdcMintAuthPda] = PublicKey.findProgramAddressSync(
    [USDC_MINT_AUTH_SEED],
    lending.programId,
  );

  for (const [name, pda] of [
    ["staking config", stakingConfigPda],
    ["lending market", marketPda],
  ] as const) {
    const info = await connection.getAccountInfo(pda);
    if (info) {
      throw new Error(
        `${name} PDA ${pda.toBase58()} already exists — reset the validator first`,
      );
    }
  }

  // ---------- STAKING ----------
  console.log("1/7 creating nSOL mint (9 decimals, owned by staking PDA)…");
  const nsolMint = await createMint(connection, payer, payer.publicKey, null, 9);
  await setAuthority(
    connection,
    payer,
    nsolMint,
    payer,
    AuthorityType.MintTokens,
    nsolMintAuthPda,
  );
  console.log(`     ${nsolMint.toBase58()} -> auth ${nsolMintAuthPda.toBase58()}`);

  console.log("2/7 creating NUT mint (9 decimals, owned by staking PDA)…");
  const nutMint = await createMint(connection, payer, payer.publicKey, null, 9);
  await setAuthority(
    connection,
    payer,
    nutMint,
    payer,
    AuthorityType.MintTokens,
    nutMintAuthPda,
  );
  console.log(`     ${nutMint.toBase58()} -> auth ${nutMintAuthPda.toBase58()}`);

  console.log("3/7 staking initialize…");
  const stakingSig = await staking.methods
    .initialize(REWARD_RATE)
    .accountsStrict({
      authority: payer.publicKey,
      config: stakingConfigPda,
      solVault: solVaultPda,
      nsolMint,
      nutMint,
      nsolMintAuthority: nsolMintAuthPda,
      nutMintAuthority: nutMintAuthPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`     config: ${stakingConfigPda.toBase58()}  tx=${stakingSig}`);

  // ---------- LENDING ----------
  console.log("4/7 creating mock USDC mint (6 decimals)…");
  const usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
  await setAuthority(
    connection,
    payer,
    usdcMint,
    payer,
    AuthorityType.MintTokens,
    usdcMintAuthPda,
  );
  console.log(`     ${usdcMint.toBase58()} -> auth ${usdcMintAuthPda.toBase58()}`);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [ORACLE_SEED, nsolMint.toBuffer()],
    lending.programId,
  );

  console.log("5/7 lending initialize_oracle…");
  const oracleSig = await lending.methods
    .initializeOracle(INITIAL_PRICE, MAX_STALENESS_SECONDS)
    .accountsStrict({
      authority: payer.publicKey,
      collateralMint: nsolMint,
      oracle: oraclePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`     oracle: ${oraclePda.toBase58()}  tx=${oracleSig}`);

  console.log("6/7 lending initialize_market…");
  const marketSig = await lending.methods
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
  console.log(`     market: ${marketPda.toBase58()}  tx=${marketSig}`);

  // ---------- OUTPUT ----------
  console.log("7/7 writing .bootstrap.json…");
  const out = {
    cluster: rpcUrl,
    payer: payer.publicKey.toBase58(),
    stakingProgramId: staking.programId.toBase58(),
    lendingProgramId: lending.programId.toBase58(),
    staking: {
      config: stakingConfigPda.toBase58(),
      solVault: solVaultPda.toBase58(),
      nsolMintAuthority: nsolMintAuthPda.toBase58(),
      nutMintAuthority: nutMintAuthPda.toBase58(),
      rewardRate: REWARD_RATE.toString(),
    },
    nsolMint: nsolMint.toBase58(),
    nutMint: nutMint.toBase58(),
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
  console.log(`     ${path.relative(process.cwd(), outPath)}`);
  console.log("\ndone — both programs live, market ready, nSOL is authoritative.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
