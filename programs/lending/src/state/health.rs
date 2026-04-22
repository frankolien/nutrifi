//! Health-factor math — the single source of truth for "is this loan
//! safe?" Every instruction that changes collateral or debt calls either
//! [`ensure_ltv`] (new position must stay under the borrow cap) or
//! [`ensure_liquidatable`] (position must be below the threshold).
//!
//! Two distinct ratios are used:
//!
//! * **LTV** — gate for *new* debt (borrow, withdraw). Tighter.
//! * **Liquidation threshold** — trigger for liquidation. Looser. The
//!   gap between them is the borrower's safety buffer against price
//!   drift before they become liquidatable.
//!
//! All values flow through this module in USDC 6-decimal units, which is
//! the natural base since that's what the oracle and the debt mint both
//! speak.

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, PRICE_PRECISION},
    errors::LendingError,
    state::{Market, UserLoan},
};

/// Value of a collateral balance in debt-token units (USDC lamports).
pub fn collateral_value(collateral: u64, price: u128) -> Result<u128> {
    (collateral as u128)
        .checked_mul(price)
        .ok_or(LendingError::MathOverflow.into())
        .map(|v| v / PRICE_PRECISION)
}

/// Inverse: how much collateral (in its smallest units) covers `value`
/// USDC lamports at the given `price`.
pub fn collateral_for_value(value: u128, price: u128) -> Result<u64> {
    if price == 0 {
        return Err(LendingError::OracleStale.into());
    }
    let raw = value
        .checked_mul(PRICE_PRECISION)
        .ok_or(LendingError::MathOverflow)?
        / price;
    u64::try_from(raw).map_err(|_| LendingError::MathOverflow.into())
}

/// Max debt permitted given collateral × LTV.
pub fn max_borrowable(collateral_val: u128, ltv_bps: u64) -> Result<u128> {
    collateral_val
        .checked_mul(ltv_bps as u128)
        .ok_or(LendingError::MathOverflow.into())
        .map(|v| v / BPS_DENOMINATOR as u128)
}

/// Assert that the loan respects `loan_to_value_bps` at the current price.
///
/// Called after every mutation that could weaken the position.
pub fn ensure_ltv(loan: &UserLoan, market: &Market, price: u128) -> Result<()> {
    let debt = loan.nominal_debt(market.borrow_index)? as u128;
    if debt == 0 {
        return Ok(());
    }
    let collat_val = collateral_value(loan.collateral, price)?;
    let cap = max_borrowable(collat_val, market.loan_to_value_bps)?;
    require!(debt <= cap, LendingError::BorrowExceedsLtv);
    Ok(())
}

/// Returns `Ok(())` only if the loan has crossed the liquidation
/// threshold. Used as a gate inside `liquidate`.
pub fn ensure_liquidatable(loan: &UserLoan, market: &Market, price: u128) -> Result<()> {
    let debt = loan.nominal_debt(market.borrow_index)? as u128;
    require!(debt > 0, LendingError::AccountHealthy);
    let collat_val = collateral_value(loan.collateral, price)?;
    // Threshold-adjusted collateral: if debt > this, the loan is unsafe.
    let safe_ceiling = collat_val
        .checked_mul(market.liquidation_threshold_bps as u128)
        .ok_or(LendingError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    require!(debt > safe_ceiling, LendingError::AccountHealthy);
    Ok(())
}
