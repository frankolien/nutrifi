//! Typed error codes for the lending program.

use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,

    #[msg("Arithmetic overflow.")]
    MathOverflow,

    #[msg("Market is paused.")]
    MarketPaused,

    #[msg("Signer is not the market authority.")]
    Unauthorized,

    #[msg("Supplied mint does not match the one stored in Market.")]
    MintMismatch,

    #[msg("Supplied vault does not match the one stored in Market.")]
    VaultMismatch,

    #[msg("Supplied oracle does not match the one stored in Market.")]
    OracleMismatch,

    #[msg("Oracle price is stale or zero.")]
    OracleStale,

    #[msg("Oracle price exceeds the protocol-defined ceiling.")]
    OraclePriceTooHigh,

    #[msg("Ratio parameter exceeds 100%.")]
    RatioTooHigh,

    #[msg("Borrow APR exceeds the protocol-defined ceiling.")]
    AprTooHigh,

    #[msg("Liquidation threshold must be greater than the loan-to-value ratio.")]
    ThresholdBelowLtv,

    #[msg("Insufficient collateral deposited for this user.")]
    InsufficientCollateral,

    #[msg("Insufficient outstanding debt for this user.")]
    InsufficientDebt,

    #[msg("Borrow would push the account below the collateral ratio.")]
    BorrowExceedsLtv,

    #[msg("Withdrawal would push the account below the collateral ratio.")]
    WithdrawExceedsLtv,

    #[msg("Account is healthy — liquidation is not permitted.")]
    AccountHealthy,

    #[msg("Requested repay amount exceeds the close factor.")]
    CloseFactorExceeded,

    #[msg("Seized collateral exceeds the borrower's posted collateral.")]
    SeizeExceedsCollateral,
}
