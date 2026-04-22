//! Typed error codes. Every fallible branch in the program resolves to one of
//! these so clients (tests, bots, frontend) can match on a stable discriminant
//! instead of string-parsing logs.

use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,

    #[msg("Arithmetic overflow.")]
    MathOverflow,

    #[msg("Reward rate exceeds the protocol-defined maximum.")]
    RewardRateTooHigh,

    #[msg("Staking pool is paused.")]
    PoolPaused,

    #[msg("Insufficient staked balance for the requested operation.")]
    InsufficientStake,

    #[msg("SOL vault has insufficient lamports to satisfy the unstake.")]
    VaultInsufficientLamports,

    #[msg("Signer is not the protocol authority.")]
    Unauthorized,

    #[msg("The supplied mint does not match the one stored in Config.")]
    MintMismatch,

    #[msg("The supplied vault PDA does not match the one stored in Config.")]
    VaultMismatch,
}
