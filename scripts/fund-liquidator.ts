/**
 * Fund the liquidator wallet with mock USDC so the bot can actually burn
 * it during `liquidate`.
 *
 *   yarn fund-liquidator [amount_usdc]       # default 5 USDC
 *
 * The USDC mint authority is a PDA (initialize_market transferred it
 * there), so we can't `mintTo` directly. Instead we do what a real user
 * would: deposit nSOL as collateral against the liquidator wallet, then
 * `borrow` mock USDC. The admin wallet is the nSOL mint authority (from
 * bootstrap), so it can mint nSOL to itself.
 *
 * Note: this adds an nSOL position owned by the liquidator. At price=75
 * (post-crash) the position is safely over-collateralised because we
 * deposit 10x what we borrow.
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
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";

import { NutrifiLending } from "../target/types/nutrifi_lending";
import lendingIdl from "../target/idl/nutrifi_lending.json";

const USER_LOAN_SEED = Buffer.from("user-loan");

interface Bootstrap {
  cluster: string;
  lendingProgramId: string;
  nsolMint: string;
  usdcMint: string;
  market: string;
  collateralVault: string;
  usdcMintAuthority: string;
  oracle: string;
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
  const amountUsdc = Number(process.argv[2] ?? "5");
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("amount must be a positive number of USDC");
  }
  const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));

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

  const nsolMint = new PublicKey(boot.nsolMint);
  const usdcMint = new PublicKey(boot.usdcMint);
  const marketPda = new PublicKey(boot.market);
  const collateralVaultPda = new PublicKey(boot.collateralVault);
  const usdcMintAuthPda = new PublicKey(boot.usdcMintAuthority);
  const oraclePda = new PublicKey(boot.oracle);

  // Collateral calculation.
  //
  // At price=75 (post-crash), a deposit of X nSOL-lamports backs:
  //   collateral_value = X * 75 / 1e6 USDC-lamports
  // Borrow capacity at 75% LTV:
  //   max_borrow = collateral_value * 0.75
  //
  // We want: amountLamports ≤ max_borrow / 2   (50% safety margin).
  // Solve: X ≥ amountLamports * 2 * 1e6 / (75 * 0.75)
  //          = amountLamports * 2 * 1e6 / 56.25
  //          ≈ amountLamports * 35_555
  const nsolDeposit = amountLamports * 36_000n; // comfortable over-collateral.

  console.log(`funding liquidator ${admin.publicKey.toBase58()} with ${amountUsdc} USDC`);
  console.log(`  will deposit ${Number(nsolDeposit) / 1e9} nSOL as collateral`);

  // 1. Mint nSOL to liquidator.
  const liquidatorNsol = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    nsolMint,
    admin.publicKey,
  );
  await mintTo(connection, admin, nsolMint, liquidatorNsol.address, admin, nsolDeposit);
  console.log(`  1/3 minted nSOL`);

  // 2. Deposit as collateral.
  const [userLoanPda] = PublicKey.findProgramAddressSync(
    [USER_LOAN_SEED, admin.publicKey.toBuffer()],
    program.programId,
  );

  // Check if already has a UserLoan (from a previous run).
  const existingLoan = await connection.getAccountInfo(userLoanPda);
  const depositTx = await program.methods
    .depositCollateral(new BN(nsolDeposit.toString()))
    .accountsStrict({
      user: admin.publicKey,
      market: marketPda,
      userLoan: userLoanPda,
      collateralMint: nsolMint,
      userCollateralAccount: liquidatorNsol.address,
      collateralVault: collateralVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  2/3 deposited nSOL  tx=${depositTx}${existingLoan ? " (added to existing loan)" : ""}`);

  // 3. Borrow USDC.
  const liquidatorUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    admin.publicKey,
  );
  const borrowTx = await program.methods
    .borrow(new BN(amountLamports.toString()))
    .accountsStrict({
      user: admin.publicKey,
      market: marketPda,
      userLoan: userLoanPda,
      owner: admin.publicKey,
      oracle: oraclePda,
      debtMint: usdcMint,
      usdcMintAuthority: usdcMintAuthPda,
      userDebtAccount: liquidatorUsdc.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`  3/3 borrowed ${amountUsdc} USDC  tx=${borrowTx}`);

  const bal = await getAccount(connection, liquidatorUsdc.address);
  console.log(`\nliquidator USDC balance: ${Number(bal.amount) / 1e6}`);
  console.log(`ready to run 'yarn bot' with BOT_DRY_RUN=false`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
