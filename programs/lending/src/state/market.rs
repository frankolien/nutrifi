//! Singleton [`Market`] account.
//!
//! One market per collateral/debt pair — this first version wires nSOL
//! (collateral) against mock USDC (debt). Extending to more pairs later
//! means making the PDA seed include the collateral mint; for now we keep
//! it singleton to match the rest of the protocol's shape.
//!
//! ### Risk parameters (all in bps)
//!
//! * `loan_to_value_bps` — the fraction of collateral value the user may
//!   borrow. e.g. `7_500` = 75%: $100 of nSOL backs at most $75 of debt.
//! * `liquidation_threshold_bps` — at this ratio the position becomes
//!   liquidatable. Must be strictly greater than `loan_to_value_bps` or a
//!   new borrow would be instantly liquidatable.
//! * `liquidation_bonus_bps` — discount liquidators get when seizing
//!   collateral. e.g. `500` = +5% of debt value paid in collateral.
//! * `close_factor_bps` — max fraction of the outstanding debt that can
//!   be repaid in a single liquidation call. Aave uses 50% to avoid
//!   fully-draining an account in one go.
//!
//! ### Interest model
//!
//! Simplest possible: a single fixed APR set by the authority, compounded
//! per-second against a global `borrow_index`. Every loan stores the
//! index it last snapshot at; current debt is
//! `scaled_debt × borrow_index / INDEX_PRECISION`. This is the Aave v2
//! "normalized debt" pattern.

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, INDEX_PRECISION, SECONDS_PER_YEAR},
    errors::LendingError,
};

#[account]
#[derive(Default, Debug)]
pub struct Market {
    /// Authority — can tune risk parameters, pause, set oracle.
    pub authority: Pubkey,

    /// Collateral mint (expected to be the nSOL mint from the staking program).
    pub collateral_mint: Pubkey,

    /// Debt mint (mock USDC — mint authority is a PDA of this program).
    pub debt_mint: Pubkey,

    /// TokenAccount PDA that custodies all deposited collateral.
    pub collateral_vault: Pubkey,

    /// Price oracle for the collateral (denominated in debt-token units).
    pub oracle: Pubkey,

    /// Total collateral deposited across all users (mirrors vault token balance).
    pub total_collateral: u64,

    /// Sum of every user's `scaled_debt`. Multiply by `borrow_index` to
    /// get nominal outstanding debt.
    pub total_scaled_debt: u128,

    /// Compounded borrow index. Starts at `INDEX_PRECISION` (== 1.0),
    /// grows monotonically.
    pub borrow_index: u128,

    /// Unix ts of the last `borrow_index` update.
    pub last_update_ts: i64,

    /// Fixed APR in bps (e.g. `500` = 5%). Applied per-second.
    pub borrow_apr_bps: u64,

    /// Borrow cap as a fraction of collateral value (bps).
    pub loan_to_value_bps: u64,

    /// Liquidation cutoff (bps). Must be > `loan_to_value_bps`.
    pub liquidation_threshold_bps: u64,

    /// Bonus collateral the liquidator seizes (bps, on top of the debt value).
    pub liquidation_bonus_bps: u64,

    /// Max share of a loan that can be repaid in one liquidation (bps).
    pub close_factor_bps: u64,

    /// If true, deposit/withdraw/borrow/repay/liquidate all revert.
    pub paused: bool,

    /// Bumps for address verification.
    pub bump: u8,
    pub collateral_vault_bump: u8,
    pub usdc_mint_auth_bump: u8,
}

impl Market {
    pub const SIZE: usize = 8     // discriminator
        + 32                       // authority
        + 32                       // collateral_mint
        + 32                       // debt_mint
        + 32                       // collateral_vault
        + 32                       // oracle
        + 8                        // total_collateral
        + 16                       // total_scaled_debt
        + 16                       // borrow_index
        + 8                        // last_update_ts
        + 8                        // borrow_apr_bps
        + 8                        // loan_to_value_bps
        + 8                        // liquidation_threshold_bps
        + 8                        // liquidation_bonus_bps
        + 8                        // close_factor_bps
        + 1                        // paused
        + 1                        // bump
        + 1                        // collateral_vault_bump
        + 1; //                       usdc_mint_auth_bump

    /// Advance `borrow_index` by the interest earned since `last_update_ts`.
    ///
    /// Uses **simple linear accrual** per tick:
    /// ```text
    /// borrow_index *= 1 + apr * elapsed / SECONDS_PER_YEAR
    /// ```
    /// Because accruals happen on every user action the gap between ticks
    /// is small, so linear approximation ≈ continuous compounding within a
    /// few bps per year — acceptable for a tutorial protocol. A production
    /// market would use `rpow` for exact compounding.
    pub fn accrue_interest(&mut self, now: i64) -> Result<()> {
        if now <= self.last_update_ts {
            return Ok(());
        }
        let elapsed = (now - self.last_update_ts) as u128;

        // delta_rate = apr_bps * elapsed / (BPS × SECONDS_PER_YEAR), scaled
        // up by INDEX_PRECISION so it lives in the same space as the index.
        let numerator = (self.borrow_apr_bps as u128)
            .checked_mul(elapsed)
            .ok_or(LendingError::MathOverflow)?
            .checked_mul(INDEX_PRECISION)
            .ok_or(LendingError::MathOverflow)?;
        let denom = (BPS_DENOMINATOR as u128)
            .checked_mul(SECONDS_PER_YEAR as u128)
            .ok_or(LendingError::MathOverflow)?;
        let delta_rate = numerator / denom;

        // borrow_index += borrow_index * delta_rate / INDEX_PRECISION
        let growth = self
            .borrow_index
            .checked_mul(delta_rate)
            .ok_or(LendingError::MathOverflow)?
            / INDEX_PRECISION;
        self.borrow_index = self
            .borrow_index
            .checked_add(growth)
            .ok_or(LendingError::MathOverflow)?;
        self.last_update_ts = now;
        Ok(())
    }
}
