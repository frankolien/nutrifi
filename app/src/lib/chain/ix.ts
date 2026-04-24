/**
 * Browser-side instruction encoders for the lending program.
 *
 * Mirror of `services/src/shared/ix.ts`, extended with the four user-
 * facing instructions the UI needs: `deposit_collateral`, `borrow`,
 * `repay`, `withdraw_collateral`. Hand-rolled rather than going through
 * Anchor's generated client so the app isn't coupled to `target/idl`
 * being in a specific relative path from Vite's root.
 *
 * The account ordering MUST match the `#[derive(Accounts)]` structs in
 * `programs/lending/src/instructions/*.rs` exactly. If you reorder any
 * on-chain, update here too.
 *
 * Anchor instruction discriminator = `sha256("global:<name>")[..8]`.
 */

import { sha256 } from "@noble/hashes/sha256";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { CONFIG, USER_LOAN_SEED } from "@/lib/config";

const textEncoder = new TextEncoder();

function ixDiscriminator(name: string): Uint8Array {
  return sha256(textEncoder.encode(`global:${name}`)).slice(0, 8);
}

function u64LE(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function userLoanPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_LOAN_SEED, owner.toBuffer()],
    CONFIG.lendingProgramId,
  );
  return pda;
}

/* ---------------------- deposit_collateral ----------------------------- */

export function buildDepositCollateralIx(
  user: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const userCollateralAta = getAssociatedTokenAddressSync(
    CONFIG.collateralMint,
    user,
  );
  const data = concat([ixDiscriminator("deposit_collateral"), u64LE(amount)]);

  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: CONFIG.market, isSigner: false, isWritable: true },
    { pubkey: userLoanPda(user), isSigner: false, isWritable: true },
    { pubkey: CONFIG.collateralMint, isSigner: false, isWritable: false },
    { pubkey: userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: CONFIG.collateralVault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: CONFIG.lendingProgramId,
    keys,
    data: Buffer.from(data),
  });
}

/* ---------------------- withdraw_collateral ---------------------------- */

export function buildWithdrawCollateralIx(
  user: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const userCollateralAta = getAssociatedTokenAddressSync(
    CONFIG.collateralMint,
    user,
  );
  const data = concat([ixDiscriminator("withdraw_collateral"), u64LE(amount)]);

  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: CONFIG.market, isSigner: false, isWritable: true },
    { pubkey: userLoanPda(user), isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: false }, // owner (has_one target)
    { pubkey: CONFIG.collateralMint, isSigner: false, isWritable: false },
    { pubkey: CONFIG.oracle, isSigner: false, isWritable: false },
    { pubkey: userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: CONFIG.collateralVault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: CONFIG.lendingProgramId,
    keys,
    data: Buffer.from(data),
  });
}

/* ---------------------- borrow ----------------------------------------- */

export function buildBorrowIx(
  user: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const userDebtAta = getAssociatedTokenAddressSync(CONFIG.debtMint, user);
  const data = concat([ixDiscriminator("borrow"), u64LE(amount)]);

  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: CONFIG.market, isSigner: false, isWritable: true },
    { pubkey: userLoanPda(user), isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: false }, // owner
    { pubkey: CONFIG.oracle, isSigner: false, isWritable: false },
    { pubkey: CONFIG.debtMint, isSigner: false, isWritable: true },
    { pubkey: CONFIG.usdcMintAuthority, isSigner: false, isWritable: false },
    { pubkey: userDebtAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: CONFIG.lendingProgramId,
    keys,
    data: Buffer.from(data),
  });
}

/* ---------------------- liquidate -------------------------------------- */

export function buildLiquidateIx(
  liquidator: PublicKey,
  borrower: PublicKey,
  borrowerLoanPda: PublicKey,
  repayAmount: bigint,
): TransactionInstruction {
  const liquidatorDebtAta = getAssociatedTokenAddressSync(
    CONFIG.debtMint,
    liquidator,
  );
  const liquidatorCollateralAta = getAssociatedTokenAddressSync(
    CONFIG.collateralMint,
    liquidator,
  );
  const data = concat([ixDiscriminator("liquidate"), u64LE(repayAmount)]);

  const keys: AccountMeta[] = [
    { pubkey: liquidator, isSigner: true, isWritable: true },
    { pubkey: CONFIG.market, isSigner: false, isWritable: true },
    { pubkey: borrower, isSigner: false, isWritable: false },
    { pubkey: borrowerLoanPda, isSigner: false, isWritable: true },
    { pubkey: CONFIG.oracle, isSigner: false, isWritable: false },
    { pubkey: CONFIG.collateralMint, isSigner: false, isWritable: false },
    { pubkey: CONFIG.debtMint, isSigner: false, isWritable: true },
    { pubkey: CONFIG.collateralVault, isSigner: false, isWritable: true },
    { pubkey: liquidatorDebtAta, isSigner: false, isWritable: true },
    { pubkey: liquidatorCollateralAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: CONFIG.lendingProgramId,
    keys,
    data: Buffer.from(data),
  });
}

/* ---------------------- repay ------------------------------------------ */

export function buildRepayIx(
  user: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const userDebtAta = getAssociatedTokenAddressSync(CONFIG.debtMint, user);
  const data = concat([ixDiscriminator("repay"), u64LE(amount)]);

  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: CONFIG.market, isSigner: false, isWritable: true },
    { pubkey: userLoanPda(user), isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: false }, // owner
    { pubkey: CONFIG.debtMint, isSigner: false, isWritable: true },
    { pubkey: userDebtAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: CONFIG.lendingProgramId,
    keys,
    data: Buffer.from(data),
  });
}
