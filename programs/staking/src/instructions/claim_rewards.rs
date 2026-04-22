//! `claim_rewards` — mint the user's pending NUT.
//!
//! Algorithm:
//! 1. Accrue the global index to now.
//! 2. Checkpoint the user, folding any unrealised earnings into
//!    `pending_rewards`.
//! 3. Mint `pending_rewards` NUT to the user and zero the counter.
//!
//! Zero pending is not an error — we treat it as a no-op so frontends can
//! call it optimistically.

use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, NUT_MINT_AUTH_SEED, USER_STAKE_SEED},
    errors::StakingError,
    state::{Config, UserStake},
};

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ StakingError::PoolPaused,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [USER_STAKE_SEED, user.key().as_ref()],
        bump = user_stake.bump,
        has_one = owner @ StakingError::Unauthorized,
    )]
    pub user_stake: Account<'info, UserStake>,

    /// CHECK: equality enforced via `has_one` on `user_stake`.
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.nut_mint @ StakingError::MintMismatch,
    )]
    pub nut_mint: Account<'info, Mint>,

    /// CHECK: PDA signer for the NUT mint.
    #[account(
        seeds = [NUT_MINT_AUTH_SEED],
        bump = config.nut_mint_auth_bump,
    )]
    pub nut_mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = nut_mint,
        token::authority = user,
    )]
    pub user_nut_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimRewards>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    let user_stake = &mut ctx.accounts.user_stake;

    config.accrue_rewards(now)?;
    user_stake.checkpoint(config.reward_index, now)?;

    let claimable = user_stake.pending_rewards;
    if claimable == 0 {
        msg!("claim_rewards: nothing to claim for {}", ctx.accounts.user.key());
        return Ok(());
    }

    let auth_bump = config.nut_mint_auth_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[NUT_MINT_AUTH_SEED, &[auth_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.nut_mint.to_account_info(),
            to: ctx.accounts.user_nut_account.to_account_info(),
            authority: ctx.accounts.nut_mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    mint_to(cpi_ctx, claimable)?;

    user_stake.pending_rewards = 0;

    msg!(
        "claim_rewards: user={} nut_minted={}",
        ctx.accounts.user.key(),
        claimable,
    );

    Ok(())
}
