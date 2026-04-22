//! `stake` — deposit SOL, receive nSOL.
//!
//! Order of operations (critical — changing it will silently break rewards):
//!
//! 1. `Config::accrue_rewards(now)` — advance the global index.
//! 2. `UserStake::checkpoint(index, now)` — snapshot the *old* share count
//!    against the new index so the user's freshly-deposited lamports don't
//!    retroactively earn rewards for a period they weren't staking.
//! 3. Compute nSOL to mint from the *pre-deposit* exchange rate.
//! 4. Transfer SOL from user → vault.
//! 5. CPI mint nSOL to the user's token account.
//! 6. Update `Config` totals and `UserStake.shares`.

use anchor_lang::{
    prelude::*,
    system_program::{transfer as sol_transfer, Transfer as SolTransfer},
};
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, NSOL_MINT_AUTH_SEED, SOL_VAULT_SEED, USER_STAKE_SEED},
    errors::StakingError,
    state::{Config, UserStake},
};

#[derive(Accounts)]
pub struct Stake<'info> {
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
        init_if_needed,
        payer = user,
        space = UserStake::SIZE,
        seeds = [USER_STAKE_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    /// CHECK: system account PDA holding staked SOL. Validated via seeds
    /// and checked against `config.sol_vault`.
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

    /// CHECK: PDA signer for the nSOL mint.
    #[account(
        seeds = [NSOL_MINT_AUTH_SEED],
        bump = config.nsol_mint_auth_bump,
    )]
    pub nsol_mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = nsol_mint,
        token::authority = user,
    )]
    pub user_nsol_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    let user_stake = &mut ctx.accounts.user_stake;

    // 1. Advance the global reward index.
    config.accrue_rewards(now)?;

    // First-time init: stamp the owner + bump on the newly-created PDA.
    if user_stake.owner == Pubkey::default() {
        user_stake.owner = ctx.accounts.user.key();
        user_stake.bump = ctx.bumps.user_stake;
        user_stake.reward_index_checkpoint = config.reward_index;
        user_stake.last_checkpoint_ts = now;
    }

    // 2. Fold pre-deposit earnings into pending, then snapshot the new index.
    user_stake.checkpoint(config.reward_index, now)?;

    // 3. Work out nSOL issuance from the *pre-deposit* exchange rate.
    let nsol_to_mint = config.nsol_for_sol(amount)?;
    require!(nsol_to_mint > 0, StakingError::ZeroAmount);

    // 4. SOL user → vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        SolTransfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    sol_transfer(cpi_ctx, amount)?;

    // 5. Mint nSOL to the user, signed by the nSOL mint-authority PDA.
    let auth_bump = config.nsol_mint_auth_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[NSOL_MINT_AUTH_SEED, &[auth_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.nsol_mint.to_account_info(),
            to: ctx.accounts.user_nsol_account.to_account_info(),
            authority: ctx.accounts.nsol_mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    mint_to(cpi_ctx, nsol_to_mint)?;

    // 6. Book-keeping.
    config.total_staked_lamports = config
        .total_staked_lamports
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;
    config.nsol_supply = config
        .nsol_supply
        .checked_add(nsol_to_mint)
        .ok_or(StakingError::MathOverflow)?;

    user_stake.shares = user_stake
        .shares
        .checked_add(nsol_to_mint)
        .ok_or(StakingError::MathOverflow)?;

    msg!(
        "stake: user={} sol={} nsol={} total_sol={} total_nsol={}",
        ctx.accounts.user.key(),
        amount,
        nsol_to_mint,
        config.total_staked_lamports,
        config.nsol_supply
    );

    Ok(())
}
