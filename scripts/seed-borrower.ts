/**
 * Seed a demo borrower against the market bootstrapped in
 * `.bootstrap.json`. Exercises the full lifecycle so you can verify the
 * deployed programs behave end-to-end.
 *
 *   yarn seed-borrower            # deposit + borrow only
 *   yarn seed-borrower --crash    # then halve the oracle price → unhealthy
 *
 * Steps (always):
 *   1. Generate a fresh test borrower keypair + airdrop 5 SOL.
 *   2. Mint 10 nSOL to the borrower.
 *   3. `deposit_collateral` all 10 nSOL into the market vault.
 *   4. `borrow` well within LTV — ~60% of max borrow capacity.
 *
 * With --crash:
 *   5. `set_price` halves the oracle → position crosses the liquidation
 *      threshold, ready for the bot or a manual `liquidate` call.
 *
 * Idempotency: the borrower keypair is regenerated every run, so each
 * invocation creates an independent position. If you want a persistent
 * test borrower, pipe `--wallet <path>` in (not yet implemented).
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
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";

import { NutrifiLending } from "../target/types/nutrifi_lending";
import { NutrifiStaking } from "../target/types/nutrifi_staking";
import lendingIdl from "../target/idl/nutrifi_lending.json";
import stakingIdl from "../target/idl/nutrifi_staking.json";

const USER_LOAN_SEED = Buffer.from("user-loan");

interface Bootstrap {
  cluster: string;
  lendingProgramId: string;
  stakingProgramId: string;
  nsolMint: string;
  usdcMint: string;
  market: string;
  collateralVault: string;
  usdcMintAuthority: string;
  oracle: string;
  params: { initialPrice: string };
  staking?: {
    config: string;
    solVault: string;
    nsolMintAuthority: string;
  };
}

function loadBootstrap(): Bootstrap {
  const p = path.join(__dirname, "..", ".bootstrap.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `.bootstrap.json missing — run 'yarn bootstrap' first against a running validator`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p.replace(/^~/, os.homedir()), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const crash = process.argv.includes("--crash");
  const boot = loadBootstrap();

  const connection = new Connection(boot.cluster, "confirmed");
  const adminPath =
    process.env.WALLET_PATH ?? path.join(os.homedir(), ".config/solana/id.json");
  const admin = loadKeypair(adminPath);

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program<NutrifiLending>(
    lendingIdl as unknown as NutrifiLending,
    provider,
  );
  if (!boot.staking) {
    throw new Error(
      ".bootstrap.json has no staking section — run `yarn bootstrap-all` instead of the old lending-only bootstrap.",
    );
  }
  const stakingProgram = new Program<NutrifiStaking>(
    stakingIdl as unknown as NutrifiStaking,
    provider,
  );

  const nsolMint = new PublicKey(boot.nsolMint);
  const usdcMint = new PublicKey(boot.usdcMint);
  const marketPda = new PublicKey(boot.market);
  const collateralVaultPda = new PublicKey(boot.collateralVault);
  const usdcMintAuthPda = new PublicKey(boot.usdcMintAuthority);
  const oraclePda = new PublicKey(boot.oracle);
  const stakingConfigPda = new PublicKey(boot.staking.config);
  const solVaultPda = new PublicKey(boot.staking.solVault);
  const nsolMintAuthPda = new PublicKey(boot.staking.nsolMintAuthority);

  console.log(`cluster: ${boot.cluster}`);
  console.log(`market:  ${marketPda.toBase58()}\n`);

  // 1. Fresh borrower.
  const borrower = Keypair.generate();
  console.log(`borrower: ${borrower.publicKey.toBase58()}`);
  // Needs enough for: 10 SOL stake + rent for UserStake/UserLoan/ATAs + tx fees.
  const airdropSig = await connection.requestAirdrop(
    borrower.publicKey,
    15 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(airdropSig, "confirmed");

  const [userLoanPda] = PublicKey.findProgramAddressSync(
    [USER_LOAN_SEED, borrower.publicKey.toBuffer()],
    program.programId,
  );

  // 2. Stake 10 SOL → mints 10 nSOL to the borrower's nSOL ATA.
  //
  // After `bootstrap-all`, the nSOL mint is owned by a staking PDA, so
  // we can't mint directly any more. The real path is: borrower calls
  // `stake` on the staking program; that CPIs to the token program as
  // the PDA authority and mints nSOL into their ATA.
  const borrowerNsol = await getOrCreateAssociatedTokenAccount(
    connection,
    admin, // admin pays the ATA rent so the borrower's SOL stays intact for staking
    nsolMint,
    borrower.publicKey,
  );
  const stakeLamports = new BN(10 * LAMPORTS_PER_SOL);
  const stakeSig = await stakingProgram.methods
    .stake(stakeLamports)
    .accountsStrict({
      user: borrower.publicKey,
      config: stakingConfigPda,
      userStake: PublicKey.findProgramAddressSync(
        [Buffer.from("user-stake"), borrower.publicKey.toBuffer()],
        stakingProgram.programId,
      )[0],
      solVault: solVaultPda,
      nsolMint: nsolMint,
      nsolMintAuthority: nsolMintAuthPda,
      userNsolAccount: borrowerNsol.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([borrower])
    .rpc();
  console.log(`1/3 staked 10 SOL → 10 nSOL  tx=${stakeSig}`);
  const nsolAmount = 10_000_000_000n; // same units as we staked, since exchangeRate starts at 1.0

  // 3. Deposit all 10 nSOL.
  const depositSig = await program.methods
    .depositCollateral(new BN(nsolAmount.toString()))
    .accountsStrict({
      user: borrower.publicKey,
      market: marketPda,
      userLoan: userLoanPda,
      collateralMint: nsolMint,
      userCollateralAccount: borrowerNsol.address,
      collateralVault: collateralVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([borrower])
    .rpc();
  console.log(`2/3 deposited 10 nSOL  tx=${depositSig}`);

  // 4. Borrow ~60% of max LTV.
  //
  // collateral_value_usdc = 10e9 × price / PRICE_PRECISION
  //                       = 10e9 × 150 / 1e6 = 1_500_000 usdc-lamports = $1.50
  // max_borrow @ 75% LTV  = 1_125_000 usdc-lamports
  // borrow 700_000 (~62% of cap) — comfortably under.
  const borrowerUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    borrower.publicKey,
  );
  const borrowAmount = new BN(700_000);
  const borrowSig = await program.methods
    .borrow(borrowAmount)
    .accountsStrict({
      user: borrower.publicKey,
      market: marketPda,
      userLoan: userLoanPda,
      owner: borrower.publicKey,
      oracle: oraclePda,
      debtMint: usdcMint,
      usdcMintAuthority: usdcMintAuthPda,
      userDebtAccount: borrowerUsdc.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([borrower])
    .rpc();
  console.log(`3/3 borrowed $0.70 USDC  tx=${borrowSig}`);

  const usdcBal = await getAccount(connection, borrowerUsdc.address);
  console.log(`    borrower USDC balance: ${Number(usdcBal.amount) / 1e6}`);

  const loan = await program.account.userLoan.fetch(userLoanPda);
  console.log(
    `    position: collateral=${loan.collateral.toString()} scaled_debt=${loan.scaledDebt.toString()}`,
  );

  // 5. Optional: crash the price to make the loan liquidatable.
  if (crash) {
    console.log("\n--crash flag set: halving oracle price to trigger liquidation zone");
    const oldPrice = new BN(boot.params.initialPrice);
    const newPrice = oldPrice.div(new BN(2)); // 150 -> 75
    const crashSig = await program.methods
      .setPrice(newPrice)
      .accountsStrict({
        authority: admin.publicKey,
        oracle: oraclePda,
      })
      .rpc();
    console.log(`    oracle ${oldPrice.toString()} -> ${newPrice.toString()}  tx=${crashSig}`);
    console.log(`    collateral value halved — position now > 80% debt/collateral`);
    console.log(`    run 'yarn bot' (in services/) to liquidate it`);
  }

  console.log("\nborrower seeded:");
  console.log(`  pubkey: ${borrower.publicKey.toBase58()}`);
  console.log(`  loan:   ${userLoanPda.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
