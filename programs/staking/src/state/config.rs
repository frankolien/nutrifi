//! Singleton [`Config`] account: stores protocol-wide parameters and the
//! running reward accumulator.
//!
//! Design notes:
//! * PDA seeds: `["config"]`. Singleton — only one lives on-chain.
//! * `authority` can pause the pool and retune the reward rate. It cannot
//!   steal funds: the SOL vault, nSOL mint, and NUT mint are all owned by
//!   program-derived PDAs.
//! * The reward accumulator uses the "index" pattern (Compound / Aave v2
//!   style): `reward_index` grows monotonically in NUT-per-staked-lamport
//!   units. Each user snapshots the index they last checkpointed at, so
//!   reward math is O(1) per user regardless of how many stakers exist.

use anchor_lang::prelude::*;

use crate::{constants::RATE_PRECISION, errors::StakingError};

#[account]
#[derive(Default, Debug)]
pub struct Config {
    /// Authority allowed to pause/unpause and set the reward rate.
    pub authority: Pubkey,

    /// Mint of the liquid-staking receipt token (nSOL).
    pub nsol_mint: Pubkey,

    /// Mint of the reward token (NUT).
    pub nut_mint: Pubkey,

    /// System-owned PDA that custodies staked SOL.
    pub sol_vault: Pubkey,

    /// Total lamports staked across all users. Mirrors the vault balance
    /// modulo rent; we track it explicitly so off-chain readers don't need
    /// to subtract rent-exempt minimums.
    pub total_staked_lamports: u64,

    /// Total nSOL in circulation. Incremented on stake, decremented on
    /// unstake. Exchange rate = `total_staked_lamports / nsol_supply`.
    pub nsol_supply: u64,

    /// Cumulative NUT-per-lamport emitted, scaled by `RATE_PRECISION`.
    /// Monotonically non-decreasing.
    pub reward_index: u128,

    /// Unix timestamp of the last `reward_index` update.
    pub last_update_ts: i64,

    /// NUT emitted per staked lamport per year, scaled by `RATE_PRECISION`.
    /// I.e. `reward_rate = 100_000_000_000` means 10% APY in NUT terms.
    pub reward_rate: u64,

    /// If true, stake/unstake/claim all revert with `PoolPaused`.
    pub paused: bool,

    /// Bump of this Config PDA.
    pub bump: u8,
    /// Bump of the SOL vault PDA.
    pub sol_vault_bump: u8,
    /// Bump of the nSOL mint authority PDA.
    pub nsol_mint_auth_bump: u8,
    /// Bump of the NUT mint authority PDA.
    pub nut_mint_auth_bump: u8,
}

impl Config {
    /// 8-byte discriminator + fields. Sized explicitly so we never rely on
    /// `InitSpace` drift across Anchor versions.
    pub const SIZE: usize = 8      // discriminator
        + 32                        // authority
        + 32                        // nsol_mint
        + 32                        // nut_mint
        + 32                        // sol_vault
        + 8                         // total_staked_lamports
        + 8                         // nsol_supply
        + 16                        // reward_index
        + 8                         // last_update_ts
        + 8                         // reward_rate
        + 1                         // paused
        + 1                         // bump
        + 1                         // sol_vault_bump
        + 1                         // nsol_mint_auth_bump
        + 1; //                        nut_mint_auth_bump

    /// Advance `reward_index` to `now`.
    ///
    /// The increment is:
    ///
    /// ```text
    /// delta_index = reward_rate * elapsed / SECONDS_PER_YEAR
    /// ```
    ///
    /// `reward_rate` is already NUT-per-lamport-per-year scaled by
    /// `RATE_PRECISION`, so the result stays in the same scale.
    ///
    /// We don't multiply by `total_staked_lamports` here: the index is
    /// per-lamport, and each user's reward is computed as
    /// `user_stake * (index - user_checkpoint) / RATE_PRECISION` at claim
    /// time. This keeps the math O(1) per user.
    pub fn accrue_rewards(&mut self, now: i64) -> Result<()> {
        if now <= self.last_update_ts {
            return Ok(());
        }
        let elapsed = (now - self.last_update_ts) as u128;
        let delta = (self.reward_rate as u128)
            .checked_mul(elapsed)
            .ok_or(StakingError::MathOverflow)?
            / (crate::constants::SECONDS_PER_YEAR as u128);

        self.reward_index = self
            .reward_index
            .checked_add(delta)
            .ok_or(StakingError::MathOverflow)?;
        self.last_update_ts = now;
        Ok(())
    }

    /// Exchange rate used when minting nSOL against a SOL deposit.
    ///
    /// Returns the number of nSOL lamports the user should receive for
    /// `sol_lamports`. Uses the pre-deposit supplies; the caller must call
    /// this **before** mutating `total_staked_lamports` / `nsol_supply`.
    ///
    /// Rules:
    /// * First depositor (`nsol_supply == 0`): 1:1 issuance.
    /// * Otherwise: `sol_lamports * nsol_supply / total_staked_lamports`.
    ///   This tracks the appreciating peg — if the protocol later accrues
    /// slashing/rewards at the SOL layer, new stakers pay the going rate.
    pub fn nsol_for_sol(&self, sol_lamports: u64) -> Result<u64> {
        if self.nsol_supply == 0 || self.total_staked_lamports == 0 {
            return Ok(sol_lamports);
        }
        let numerator = (sol_lamports as u128)
            .checked_mul(self.nsol_supply as u128)
            .ok_or(StakingError::MathOverflow)?;
        let minted = numerator / (self.total_staked_lamports as u128);
        u64::try_from(minted).map_err(|_| StakingError::MathOverflow.into())
    }

    /// Inverse of [`nsol_for_sol`]: how many SOL lamports back a given
    /// `nsol_lamports` amount. Used on unstake.
    pub fn sol_for_nsol(&self, nsol_lamports: u64) -> Result<u64> {
        if self.nsol_supply == 0 {
            return Ok(0);
        }
        let numerator = (nsol_lamports as u128)
            .checked_mul(self.total_staked_lamports as u128)
            .ok_or(StakingError::MathOverflow)?;
        let out = numerator / (self.nsol_supply as u128);
        u64::try_from(out).map_err(|_| StakingError::MathOverflow.into())
    }
}

/// Compile-time sanity: ensures `RATE_PRECISION` matches documented 12 decimals.
const _: () = assert!(RATE_PRECISION == 1_000_000_000_000);
