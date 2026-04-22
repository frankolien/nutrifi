//! `initialize` — one-time bootstrap of the protocol.
//!
//! Creates the singleton [`Config`] PDA, records the bumps of the four PDAs
//! that own protocol funds (SOL vault, nSOL mint authority, NUT mint
//! authority) and seeds the reward rate + timestamp.
//!
//! The nSOL and NUT mints are passed in already created — this lets the
//! deployer decide decimals and (optionally) pre-mint a treasury supply
//! before handing mint authority to the PDA. The instruction validates that
//! the mint authority on each mint is already set to the expected PDA.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::{
    constants::{
        CONFIG_SEED, MAX_REWARD_RATE, NSOL_MINT_AUTH_SEED, NUT_MINT_AUTH_SEED, SOL_VAULT_SEED,
    },
    errors::StakingError,
    state::Config,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Pays rent for the Config account and becomes the protocol authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Config::SIZE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// System-owned PDA that will custody staked SOL. Not allocated here —
    /// the vault is a naked system account; lamports land on it via
    /// `system_program::transfer` during `stake` and leave via direct
    /// lamport mutation during `unstake`. We only need its address/bump.
    ///
    /// CHECK: Validated by seeds.
    #[account(
        seeds = [SOL_VAULT_SEED],
        bump,
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// nSOL mint. Must already exist and have its mint authority set to
    /// the PDA derived from `[NSOL_MINT_AUTH_SEED]`.
    #[account(
        mint::authority = nsol_mint_authority,
    )]
    pub nsol_mint: Account<'info, Mint>,

    /// NUT mint. Same constraint against its own authority PDA.
    #[account(
        mint::authority = nut_mint_authority,
    )]
    pub nut_mint: Account<'info, Mint>,

    /// CHECK: PDA — address validated via seeds, no data read.
    #[account(
        seeds = [NSOL_MINT_AUTH_SEED],
        bump,
    )]
    pub nsol_mint_authority: UncheckedAccount<'info>,

    /// CHECK: PDA — address validated via seeds, no data read.
    #[account(
        seeds = [NUT_MINT_AUTH_SEED],
        bump,
    )]
    pub nut_mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, reward_rate: u64) -> Result<()> {
    require!(
        reward_rate <= MAX_REWARD_RATE,
        StakingError::RewardRateTooHigh
    );

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.authority.key();
    config.nsol_mint = ctx.accounts.nsol_mint.key();
    config.nut_mint = ctx.accounts.nut_mint.key();
    config.sol_vault = ctx.accounts.sol_vault.key();
    config.total_staked_lamports = 0;
    config.nsol_supply = 0;
    config.reward_index = 0;
    config.last_update_ts = clock.unix_timestamp;
    config.reward_rate = reward_rate;
    config.paused = false;
    config.bump = ctx.bumps.config;
    config.sol_vault_bump = ctx.bumps.sol_vault;
    config.nsol_mint_auth_bump = ctx.bumps.nsol_mint_authority;
    config.nut_mint_auth_bump = ctx.bumps.nut_mint_authority;

    msg!(
        "NutriFi initialized: authority={}, reward_rate={}, nsol_mint={}, nut_mint={}",
        config.authority,
        config.reward_rate,
        config.nsol_mint,
        config.nut_mint,
    );

    Ok(())
}
