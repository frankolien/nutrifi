/**
 * Account-data decoders.
 *
 * We decode manually (little-endian primitives out of a Buffer) instead
 * of importing Anchor-generated types. Rationale:
 *   - Anchor's generated types live in `target/types/` and only exist
 *     after `anchor build`. The services need to compile standalone.
 *   - The layouts are small and fixed — a dedicated decoder is ~20 LOC
 *     per struct, more robust than keeping another schema in sync.
 *
 * If you edit the account layouts in the Rust programs, update the
 * matching `decode*` function here. The layouts are the ones declared
 * in:
 *   - programs/lending/src/state/{market,user_loan,oracle}.rs
 *   - programs/staking/src/state/{config,user_stake}.rs
 *
 * Every Anchor-managed account starts with an 8-byte discriminator; we
 * skip past it before reading fields.
 */

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const DISCRIMINATOR_LEN = 8;

class Cursor {
  constructor(
    private readonly buf: Buffer,
    private off = DISCRIMINATOR_LEN,
  ) {}

  u8(): number {
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u64(): BN {
    const v = new BN(this.buf.subarray(this.off, this.off + 8), "le");
    this.off += 8;
    return v;
  }

  i64(): BN {
    // Two's-complement signed. BN can read LE but we need to fixup sign.
    const raw = new BN(this.buf.subarray(this.off, this.off + 8), "le");
    this.off += 8;
    const high = this.buf.readUInt8(this.off - 1);
    if (high & 0x80) {
      // Negative — convert from two's complement.
      return raw.sub(new BN(2).pow(new BN(64)));
    }
    return raw;
  }

  u128(): BN {
    const v = new BN(this.buf.subarray(this.off, this.off + 16), "le");
    this.off += 16;
    return v;
  }

  pubkey(): PublicKey {
    const slice = this.buf.subarray(this.off, this.off + 32);
    this.off += 32;
    return new PublicKey(slice);
  }
}

// ------------------------------ Lending --------------------------------

export interface Market {
  authority: PublicKey;
  collateralMint: PublicKey;
  debtMint: PublicKey;
  collateralVault: PublicKey;
  oracle: PublicKey;
  totalCollateral: BN;
  totalScaledDebt: BN;
  borrowIndex: BN;
  lastUpdateTs: BN;
  borrowAprBps: BN;
  loanToValueBps: BN;
  liquidationThresholdBps: BN;
  liquidationBonusBps: BN;
  closeFactorBps: BN;
  paused: boolean;
  bump: number;
  collateralVaultBump: number;
  usdcMintAuthBump: number;
}

export function decodeMarket(data: Buffer): Market {
  const c = new Cursor(data);
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
  collateral: BN;
  scaledDebt: BN;
  lastUpdateTs: BN;
  bump: number;
}

export function decodeUserLoan(data: Buffer): UserLoan {
  const c = new Cursor(data);
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
  price: BN;
  publishedTs: BN;
  maxStalenessSeconds: BN;
  bump: number;
}

export function decodeMockOracle(data: Buffer): MockOracle {
  const c = new Cursor(data);
  return {
    authority: c.pubkey(),
    collateralMint: c.pubkey(),
    price: c.u128(),
    publishedTs: c.i64(),
    maxStalenessSeconds: c.i64(),
    bump: c.u8(),
  };
}

// ---------------------- Anchor account discriminators ------------------

import * as crypto from "crypto";

/**
 * Anchor computes an account's 8-byte discriminator as
 * `sha256("account:<StructName>")[..8]`. We pre-compute the ones we need
 * so `getProgramAccounts` can filter by memcmp on prefix.
 */
function anchorAccountDiscriminator(name: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`account:${name}`)
    .digest()
    .subarray(0, 8);
}

export const MARKET_DISCRIMINATOR = anchorAccountDiscriminator("Market");
export const USER_LOAN_DISCRIMINATOR = anchorAccountDiscriminator("UserLoan");
export const MOCK_ORACLE_DISCRIMINATOR = anchorAccountDiscriminator("MockOracle");
