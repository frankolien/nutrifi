/**
 * Hand-built instruction encoders for the two on-chain calls the
 * services need: `set_price` (pricefeed) and `liquidate` (bot).
 *
 * We could use Anchor's generated Program client, but that couples the
 * services to a successful `anchor build` and the generated types. The
 * surface here is tiny (two instructions, six args total), so a
 * dedicated encoder is simpler and compiles cold.
 *
 * Anchor instruction discriminator = `sha256("global:<name>")[..8]`.
 * Args are plain borsh after that.
 */

import * as crypto from "crypto";
import BN from "bn.js";
import {
  PublicKey,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

function ixDiscriminator(name: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function u128ToLeBuffer(v: BN): Buffer {
  const out = v.toArrayLike(Buffer, "le", 16);
  return out;
}

function u64ToLeBuffer(v: BN): Buffer {
  return v.toArrayLike(Buffer, "le", 8);
}

// ---------------- set_price (lending program, mock oracle) --------------

export interface SetPriceAccounts {
  programId: PublicKey;
  authority: PublicKey;
  oracle: PublicKey;
}

/**
 * Encodes `nutrifi_lending::set_price(new_price: u128)`. Accounts order
 * **must** match the `SetPrice` struct in
 * `programs/lending/src/instructions/oracle.rs`.
 */
export function buildSetPriceIx(
  accounts: SetPriceAccounts,
  newPrice: BN,
): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("set_price"),
    u128ToLeBuffer(newPrice),
  ]);
  const keys: AccountMeta[] = [
    { pubkey: accounts.authority, isSigner: true, isWritable: false },
    { pubkey: accounts.oracle, isSigner: false, isWritable: true },
  ];
  return new TransactionInstruction({
    programId: accounts.programId,
    keys,
    data,
  });
}

// ---------------- liquidate (lending program) ---------------------------

export interface LiquidateAccounts {
  programId: PublicKey;
  liquidator: PublicKey;
  market: PublicKey;
  borrower: PublicKey;
  userLoan: PublicKey;
  oracle: PublicKey;
  collateralMint: PublicKey;
  debtMint: PublicKey;
  collateralVault: PublicKey;
  liquidatorDebtAccount: PublicKey;
  liquidatorCollateralAccount: PublicKey;
}

/**
 * Encodes `nutrifi_lending::liquidate(repay_amount: u64)`. Accounts order
 * **must** match the `Liquidate` struct in
 * `programs/lending/src/instructions/liquidate.rs`.
 */
export function buildLiquidateIx(
  accounts: LiquidateAccounts,
  repayAmount: BN,
): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("liquidate"),
    u64ToLeBuffer(repayAmount),
  ]);
  const keys: AccountMeta[] = [
    { pubkey: accounts.liquidator, isSigner: true, isWritable: true },
    { pubkey: accounts.market, isSigner: false, isWritable: true },
    { pubkey: accounts.borrower, isSigner: false, isWritable: false },
    { pubkey: accounts.userLoan, isSigner: false, isWritable: true },
    { pubkey: accounts.oracle, isSigner: false, isWritable: false },
    { pubkey: accounts.collateralMint, isSigner: false, isWritable: false },
    { pubkey: accounts.debtMint, isSigner: false, isWritable: true },
    { pubkey: accounts.collateralVault, isSigner: false, isWritable: true },
    {
      pubkey: accounts.liquidatorDebtAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: accounts.liquidatorCollateralAccount,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: accounts.programId,
    keys,
    data,
  });
}
