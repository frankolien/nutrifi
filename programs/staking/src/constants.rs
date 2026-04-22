//! Protocol-wide constants. Kept in one place so the seeds used on-chain and
//! off-chain (tests, bots, frontend) never drift apart.

use anchor_lang::prelude::*;

/// Seed for the singleton [`Config`](crate::state::Config) PDA.
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

/// Seed for the SOL vault PDA (a plain system account that holds staked SOL).
#[constant]
pub const SOL_VAULT_SEED: &[u8] = b"sol-vault";

/// Seed for the nSOL mint authority PDA.
#[constant]
pub const NSOL_MINT_AUTH_SEED: &[u8] = b"nsol-mint-auth";

/// Seed for the NUT mint authority PDA.
#[constant]
pub const NUT_MINT_AUTH_SEED: &[u8] = b"nut-mint-auth";

/// Seed for per-user [`UserStake`](crate::state::UserStake) PDAs.
#[constant]
pub const USER_STAKE_SEED: &[u8] = b"user-stake";

/// Fixed-point scale used for the staking exchange rate and the reward index.
///
/// We store rates as `u128` with 12 decimals of precision. 12 is enough to
/// express sub-lamport dust without overflowing when multiplied by the full
/// SOL supply (~6.4e17 lamports worst-case).
pub const RATE_PRECISION: u128 = 1_000_000_000_000;

/// Seconds in a year, used as the denominator for APY-style reward emission.
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Hard cap on reward rate (NUT per staked lamport per year, scaled by
/// [`RATE_PRECISION`]). Prevents an authority mis-set from minting unbounded
/// rewards. 1.0 == 100% APY denominated in NUT vs staked lamports.
pub const MAX_REWARD_RATE: u64 = 1_000_000_000_000;
