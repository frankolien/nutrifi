//! Authority-gated ops: `set_params`, `set_paused`, `set_authority`.
//!
//! All mutators accrue interest first so parameter changes don't
//! retroactively apply to the interval since the last update.

use anchor_lang::prelude::*;

use crate::{
    constants::MARKET_SEED, errors::LendingError, instructions::initialize_market::MarketParams,
    state::Market,
};

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump,
        has_one = authority @ LendingError::Unauthorized,
    )]
    pub market: Account<'info, Market>,
}

pub fn set_params(ctx: Context<AdminOnly>, params: MarketParams) -> Result<()> {
    params.validate()?;
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;
    market.borrow_apr_bps = params.borrow_apr_bps;
    market.loan_to_value_bps = params.loan_to_value_bps;
    market.liquidation_threshold_bps = params.liquidation_threshold_bps;
    market.liquidation_bonus_bps = params.liquidation_bonus_bps;
    market.close_factor_bps = params.close_factor_bps;
    msg!(
        "set_params: apr={} ltv={} liq={} bonus={} close={}",
        market.borrow_apr_bps,
        market.loan_to_value_bps,
        market.liquidation_threshold_bps,
        market.liquidation_bonus_bps,
        market.close_factor_bps,
    );
    Ok(())
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;
    market.paused = paused;
    msg!("set_paused: {}", paused);
    Ok(())
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    pub authority: Signer<'info>,

    /// CHECK: any pubkey — becomes the new market authority.
    pub new_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump,
        has_one = authority @ LendingError::Unauthorized,
    )]
    pub market: Account<'info, Market>,
}

pub fn set_authority(ctx: Context<SetAuthority>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let old = market.authority;
    market.authority = ctx.accounts.new_authority.key();
    msg!("set_authority: {} -> {}", old, market.authority);
    Ok(())
}
