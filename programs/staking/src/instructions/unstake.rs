//! `unstake` — burn nSOL, withdraw SOL.
//!
//! Symmetric with `stake`. Two subtleties worth calling out:
//!
//! * The SOL vault is a *naked system account* owned by the System Program.
//!   We pull lamports out via `system_program::transfer` signed by the
//!   vault PDA's seeds — the runtime forbids direct lamport debits from
//!   accounts the program doesn't own.
//!
//! * We use the *current* exchange rate. If the peg has appreciated (e.g.
//!   donations to the vault, future slashing protection, etc.) unstakers
//!   benefit. If it has depreciated, they pay the loss.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as sys_transfer, Transfer as SysTransfer};
use anchor_spl::token::{burn, Burn, Mint, Token, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, SOL_VAULT_SEED, USER_STAKE_SEED},
    errors::StakingError,
    state::{Config, UserStake},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
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

    /// Matches `user_stake.owner` — Anchor's `has_one` sugar.
    /// CHECK: equality enforced by has_one above.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: system PDA, funds source.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED],
        bump = config.sol_vault_bump,
        constraint = sol_vault.key() == config.sol_vault @ StakingError::VaultMismatch,
    )]
    pub sol_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.nsol_mint @ StakingError::MintMismatch,
    )]
    pub nsol_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = nsol_mint,
        token::authority = user,
    )]
    pub user_nsol_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Unstake>, nsol_amount: u64) -> Result<()> {
    require!(nsol_amount > 0, StakingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    let user_stake = &mut ctx.accounts.user_stake;

    require!(
        user_stake.shares >= nsol_amount,
        StakingError::InsufficientStake
    );

    config.accrue_rewards(now)?;
    user_stake.checkpoint(config.reward_index, now)?;

    // Work out SOL owed at the *current* peg.
    let sol_out = config.sol_for_nsol(nsol_amount)?;
    require!(sol_out > 0, StakingError::ZeroAmount);

    // Burn the user's nSOL. User signs — no PDA seeds needed.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.nsol_mint.to_account_info(),
            from: ctx.accounts.user_nsol_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    burn(cpi_ctx, nsol_amount)?;

    // The vault is a system-owned PDA; send lamports out via a signed
    // `system_program::transfer` rather than direct lamport mutation
    // (the runtime rejects direct debits from accounts the program doesn't own).
    require!(
        ctx.accounts.sol_vault.lamports() >= sol_out,
        StakingError::VaultInsufficientLamports
    );
    let vault_bump = config.sol_vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[SOL_VAULT_SEED, &[vault_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        SysTransfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        },
        signer_seeds,
    );
    sys_transfer(cpi_ctx, sol_out)?;

    // Book-keeping.
    config.total_staked_lamports = config
        .total_staked_lamports
        .checked_sub(sol_out)
        .ok_or(StakingError::MathOverflow)?;
    config.nsol_supply = config
        .nsol_supply
        .checked_sub(nsol_amount)
        .ok_or(StakingError::MathOverflow)?;
    user_stake.shares = user_stake
        .shares
        .checked_sub(nsol_amount)
        .ok_or(StakingError::MathOverflow)?;

    msg!(
        "unstake: user={} nsol={} sol={} remaining_shares={}",
        ctx.accounts.user.key(),
        nsol_amount,
        sol_out,
        user_stake.shares,
    );

    Ok(())
}
