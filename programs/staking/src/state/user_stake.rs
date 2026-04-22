//! Per-user [`UserStake`] account. Seeded by `["user-stake", owner]` so
//! every wallet has exactly one stake record per program.
//!
//! Holds two things:
//! 1. The user's nSOL share count (redundant with their token balance, but
//!    stored here so off-chain indexers don't need to walk token accounts).
//! 2. The reward-index checkpoint used by the O(1) rewards algorithm —
//!    when the user last claimed, what was the global `reward_index`?

use anchor_lang::prelude::*;

use crate::{constants::RATE_PRECISION, errors::StakingError};

#[account]
#[derive(Default, Debug)]
pub struct UserStake {
    /// Wallet that owns this stake record.
    pub owner: Pubkey,

    /// nSOL held by the user that is actively earning rewards.
    ///
    /// We track this on-chain (instead of reading the user's token account)
    /// so the reward math runs inside a single account context and so users
    /// can move nSOL freely without losing pending rewards at the protocol
    /// layer. Rewards are accrued on every stake/unstake/claim.
    pub shares: u64,

    /// Snapshot of `Config.reward_index` at the last checkpoint. Any rewards
    /// earned between `reward_index_checkpoint` and the current
    /// `Config.reward_index` are attributable to this user.
    pub reward_index_checkpoint: u128,

    /// NUT lamports earned but not yet minted. Accumulated on each
    /// stake/unstake so the user's share of a stale index isn't lost when
    /// their balance changes.
    pub pending_rewards: u64,

    /// Unix ts of the last checkpoint — informational; off-chain APY
    /// estimates read this.
    pub last_checkpoint_ts: i64,

    /// Bump of this PDA.
    pub bump: u8,
}

impl UserStake {
    pub const SIZE: usize = 8    // discriminator
        + 32                      // owner
        + 8                       // shares
        + 16                      // reward_index_checkpoint
        + 8                       // pending_rewards
        + 8                       // last_checkpoint_ts
        + 1; //                      bump

    /// Fold unrealised rewards into `pending_rewards` and advance the
    /// checkpoint. Call this **before** any change to `shares`.
    ///
    /// Math:
    /// ```text
    /// earned = shares * (current_index - checkpoint) / RATE_PRECISION
    /// ```
    pub fn checkpoint(&mut self, current_index: u128, now: i64) -> Result<()> {
        let delta = current_index
            .checked_sub(self.reward_index_checkpoint)
            .ok_or(StakingError::MathOverflow)?;
        if delta > 0 && self.shares > 0 {
            let earned = (self.shares as u128)
                .checked_mul(delta)
                .ok_or(StakingError::MathOverflow)?
                / RATE_PRECISION;
            let earned_u64 = u64::try_from(earned).map_err(|_| StakingError::MathOverflow)?;
            self.pending_rewards = self
                .pending_rewards
                .checked_add(earned_u64)
                .ok_or(StakingError::MathOverflow)?;
        }
        self.reward_index_checkpoint = current_index;
        self.last_checkpoint_ts = now;
        Ok(())
    }
}
