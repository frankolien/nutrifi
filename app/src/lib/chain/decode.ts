/**
 * Browser-side decoders for the lending program's account layouts.
 *
 * Mirror of `services/src/shared/decode.ts`. We could share it via a
 * package, but these are ~60 LOC and duplicating them avoids a
 * monorepo/bundling headache. If you change a layout on-chain, update
 * both files.
 */

import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

function anchorAccountDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`account:${name}`)).slice(0, 8);
}

export const MARKET_DISCRIMINATOR = anchorAccountDiscriminator("Market");
export const USER_LOAN_DISCRIMINATOR = anchorAccountDiscriminator("UserLoan");
export const MOCK_ORACLE_DISCRIMINATOR = anchorAccountDiscriminator("MockOracle");

const DISCRIMINATOR_LEN = 8;

class Cursor {
  private off = DISCRIMINATOR_LEN;
  constructor(private readonly view: DataView) {}

  u8(): number {
    const v = this.view.getUint8(this.off);
    this.off += 1;
    return v;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u64(): bigint {
    const v = this.view.getBigUint64(this.off, true);
    this.off += 8;
    return v;
  }

  i64(): bigint {
    const v = this.view.getBigInt64(this.off, true);
    this.off += 8;
    return v;
  }

  u128(): bigint {
    const lo = this.view.getBigUint64(this.off, true);
    const hi = this.view.getBigUint64(this.off + 8, true);
    this.off += 16;
    return (hi << 64n) | lo;
  }

  pubkey(): PublicKey {
    const slice = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.off,
      32,
    );
    this.off += 32;
    return new PublicKey(slice);
  }
}

export interface Market {
  authority: PublicKey;
  collateralMint: PublicKey;
  debtMint: PublicKey;
  collateralVault: PublicKey;
  oracle: PublicKey;
  totalCollateral: bigint;
  totalScaledDebt: bigint;
  borrowIndex: bigint;
  lastUpdateTs: bigint;
  borrowAprBps: bigint;
  loanToValueBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  closeFactorBps: bigint;
  paused: boolean;
  bump: number;
  collateralVaultBump: number;
  usdcMintAuthBump: number;
}

export function decodeMarket(data: Uint8Array): Market {
  const c = new Cursor(new DataView(data.buffer, data.byteOffset, data.byteLength));
  return {
    authority: c.pubkey(),
    collateralMint: c.pubkey(),
    debtMint: c.pubkey(),
    collateralVault: c.pubkey(),
    oracle: c.pubkey(),
    totalCollateral: c.u64(),
    totalScaledDebt: c.u128(),
    borrowIndex: c.u128(),
    lastUpdateTs: c.i64(),
    borrowAprBps: c.u64(),
    loanToValueBps: c.u64(),
    liquidationThresholdBps: c.u64(),
    liquidationBonusBps: c.u64(),
    closeFactorBps: c.u64(),
    paused: c.bool(),
    bump: c.u8(),
    collateralVaultBump: c.u8(),
    usdcMintAuthBump: c.u8(),
  };
}

export interface UserLoan {
  owner: PublicKey;
  collateral: bigint;
  scaledDebt: bigint;
  lastUpdateTs: bigint;
  bump: number;
}

export function decodeUserLoan(data: Uint8Array): UserLoan {
  const c = new Cursor(new DataView(data.buffer, data.byteOffset, data.byteLength));
  return {
    owner: c.pubkey(),
    collateral: c.u64(),
    scaledDebt: c.u128(),
    lastUpdateTs: c.i64(),
    bump: c.u8(),
  };
}

export interface MockOracle {
  authority: PublicKey;
  collateralMint: PublicKey;
  price: bigint;
  publishedTs: bigint;
  maxStalenessSeconds: bigint;
  bump: number;
}

export function decodeMockOracle(data: Uint8Array): MockOracle {
  const c = new Cursor(new DataView(data.buffer, data.byteOffset, data.byteLength));
  return {
    authority: c.pubkey(),
    collateralMint: c.pubkey(),
    price: c.u128(),
    publishedTs: c.i64(),
    maxStalenessSeconds: c.i64(),
    bump: c.u8(),
  };
}

// INDEX_PRECISION = 1e18 in programs/lending/src/constants.rs.
const INDEX_PRECISION = 1_000_000_000_000_000_000n;

/** Nominal outstanding debt from scaled_debt × current borrow_index. */
export function nominalDebt(scaledDebt: bigint, borrowIndex: bigint): bigint {
  if (scaledDebt === 0n) return 0n;
  return (scaledDebt * borrowIndex) / INDEX_PRECISION;
}
