//! Authority-gated ops: `set_reward_rate`, `set_paused`, `set_authority`.
//!
//! Every admin instruction accrues rewards first so the index reflects the
//! *old* rate up to `now`, then applies the change. Without that, the
//! transition effectively backdates the new rate over the elapsed period.

use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, MAX_REWARD_RATE},
    errors::StakingError,
    state::Config,
};

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ StakingError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn set_reward_rate(ctx: Context<AdminOnly>, new_rate: u64) -> Result<()> {
    require!(new_rate <= MAX_REWARD_RATE, StakingError::RewardRateTooHigh);
    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    config.accrue_rewards(now)?;
    let old = config.reward_rate;
    config.reward_rate = new_rate;
    msg!("set_reward_rate: {} -> {}", old, new_rate);
    Ok(())
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    config.accrue_rewards(now)?;
    config.paused = paused;
    msg!("set_paused: {}", paused);
    Ok(())
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    pub authority: Signer<'info>,

    /// CHECK: any pubkey — new authority.
    pub new_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ StakingError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn set_authority(ctx: Context<SetAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old = config.authority;
    config.authority = ctx.accounts.new_authority.key();
    msg!("set_authority: {} -> {}", old, config.authority);
    Ok(())
}
