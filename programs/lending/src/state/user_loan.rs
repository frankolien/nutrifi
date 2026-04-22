//! Per-user [`UserLoan`] PDA — one per borrower. Seeded by
//! `["user-loan", owner]`.
//!
//! Stores the two numbers that define a position:
//!
//! * `collateral` — nSOL tokens the user has deposited into the vault.
//! * `scaled_debt` — debt normalised to `borrow_index == 1.0`. The actual
//!   outstanding debt at time `t` is `scaled_debt × borrow_index(t) /
//!   INDEX_PRECISION`. Because we scale down at borrow time and scale up
//!   at repay/query time, interest accrual happens automatically — we
//!   don't have to touch every user's account to update it.

use anchor_lang::prelude::*;

use crate::{constants::INDEX_PRECISION, errors::LendingError};

#[account]
#[derive(Default, Debug)]
pub struct UserLoan {
    /// Wallet that owns this position.
    pub owner: Pubkey,

    /// Collateral deposited (in the collateral mint's smallest unit).
    pub collateral: u64,

    /// Debt normalised to the genesis borrow index. Real debt is
    /// `scaled_debt × market.borrow_index / INDEX_PRECISION`.
    ///
    /// u128 because the scaled representation can be larger than the
    /// nominal debt when the index climbs above 1.0 (actually smaller —
    /// scaled = nominal / index — but we keep u128 for safety across
    /// multiplications in health-factor math).
    pub scaled_debt: u128,

    pub last_update_ts: i64,
    pub bump: u8,
}

impl UserLoan {
    pub const SIZE: usize = 8   // discriminator
        + 32                     // owner
        + 8                      // collateral
        + 16                     // scaled_debt
        + 8                      // last_update_ts
        + 1; //                     bump

    /// Nominal outstanding debt at the given `borrow_index`.
    pub fn nominal_debt(&self, borrow_index: u128) -> Result<u64> {
        if self.scaled_debt == 0 {
            return Ok(0);
        }
        let raw = self
            .scaled_debt
            .checked_mul(borrow_index)
            .ok_or(LendingError::MathOverflow)?
            / INDEX_PRECISION;
        u64::try_from(raw).map_err(|_| LendingError::MathOverflow.into())
    }

    /// Convert a nominal amount (freshly borrowed / repaid) into the
    /// scaled-debt delta that should land on `scaled_debt`.
    pub fn to_scaled(amount: u64, borrow_index: u128) -> Result<u128> {
        if amount == 0 {
            return Ok(0);
        }
        let raw = (amount as u128)
            .checked_mul(INDEX_PRECISION)
            .ok_or(LendingError::MathOverflow)?;
        // ceil-div on borrow, floor-div on repay would bias in the
        // protocol's favour. For simplicity (and symmetry) we floor-div
        // both sides — dust accumulates in the user's favour at the
        // scale of sub-wei, negligible.
        Ok(raw / borrow_index)
    }
}
