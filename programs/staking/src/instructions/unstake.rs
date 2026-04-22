//! `unstake` — burn nSOL, withdraw SOL.
//!
//! Symmetric with `stake`. Two subtleties worth calling out:
//!
//! * The SOL vault is a *naked system account* owned by the System Program.
//!   We cannot `CpiContext` a transfer out of it signed by our PDA (the
//!   System Program's `transfer` instruction requires the signer to be a
//!   system-owned account without data, which ours is, but `invoke_signed`
//!   still works). Rather than dealing with that friction, we move lamports
//!   out by directly mutating the two `lamports` fields — this is the
//!   standard pattern for PDA-owned system accounts in Anchor programs.
//!
//! * We use the *current* exchange rate. If the peg has appreciated (e.g.
//!   donations to the vault, future slashing protection, etc.) unstakers
//!   benefit. If it has depreciated, they pay the loss.

use anchor_lang::prelude::*;
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

    // Direct lamport mutation on the PDA system account. See module-level
    // note — this is the canonical pattern in Anchor for sending lamports
    // out of a program-owned system account.
    let vault_ai = ctx.accounts.sol_vault.to_account_info();
    let user_ai = ctx.accounts.user.to_account_info();
    let vault_lamports = vault_ai.lamports();
    require!(
        vault_lamports >= sol_out,
        StakingError::VaultInsufficientLamports
    );
    **vault_ai.try_borrow_mut_lamports()? = vault_lamports
        .checked_sub(sol_out)
        .ok_or(StakingError::MathOverflow)?;
    **user_ai.try_borrow_mut_lamports()? = user_ai
        .lamports()
        .checked_add(sol_out)
        .ok_or(StakingError::MathOverflow)?;

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
