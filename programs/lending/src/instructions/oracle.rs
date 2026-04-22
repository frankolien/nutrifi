//! Mock oracle: `initialize_oracle` + `set_price`.
//!
//! Pyth-compatible adapter later replaces this file; the rest of the
//! program reads `MockOracle::read` regardless of source.

use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_ORACLE_PRICE, ORACLE_SEED},
    errors::LendingError,
    state::MockOracle,
};

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Mint this oracle will price. No token-program interaction — we only
    /// store its pubkey, so `UncheckedAccount` is enough.
    /// CHECK: stored on-chain, validated by subsequent market init.
    pub collateral_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = MockOracle::SIZE,
        seeds = [ORACLE_SEED, collateral_mint.key().as_ref()],
        bump,
    )]
    pub oracle: Account<'info, MockOracle>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_oracle(
    ctx: Context<InitializeOracle>,
    initial_price: u128,
    max_staleness_seconds: i64,
) -> Result<()> {
    require!(
        initial_price > 0 && initial_price <= MAX_ORACLE_PRICE,
        LendingError::OraclePriceTooHigh
    );
    require!(max_staleness_seconds > 0, LendingError::OracleStale);

    let clock = Clock::get()?;
    let oracle = &mut ctx.accounts.oracle;
    oracle.authority = ctx.accounts.authority.key();
    oracle.collateral_mint = ctx.accounts.collateral_mint.key();
    oracle.price = initial_price;
    oracle.published_ts = clock.unix_timestamp;
    oracle.max_staleness_seconds = max_staleness_seconds;
    oracle.bump = ctx.bumps.oracle;

    msg!(
        "oracle init: mint={} price={} max_staleness={}",
        oracle.collateral_mint,
        initial_price,
        max_staleness_seconds,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ LendingError::Unauthorized,
        seeds = [ORACLE_SEED, oracle.collateral_mint.as_ref()],
        bump = oracle.bump,
    )]
    pub oracle: Account<'info, MockOracle>,
}

pub fn set_price(ctx: Context<SetPrice>, new_price: u128) -> Result<()> {
    require!(
        new_price > 0 && new_price <= MAX_ORACLE_PRICE,
        LendingError::OraclePriceTooHigh
    );
    let clock = Clock::get()?;
    let oracle = &mut ctx.accounts.oracle;
    let old = oracle.price;
    oracle.price = new_price;
    oracle.published_ts = clock.unix_timestamp;
    msg!("oracle price: {} -> {}", old, new_price);
    Ok(())
}
