//! `deposit_collateral` — user locks nSOL in the market's collateral vault.
//!
//! Pure accounting + a Token CPI:
//! 1. accrue interest so `UserLoan` interacts with the up-to-date index
//!    (it doesn't change debt here but keeps the pattern uniform).
//! 2. transfer collateral user → vault (user signs).
//! 3. increment `collateral` on the user loan, `total_collateral` on the
//!    market.
//!
//! No health check needed — adding collateral only strengthens the position.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer as token_transfer, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::{COLLATERAL_VAULT_SEED, MARKET_SEED, USER_LOAN_SEED},
    errors::LendingError,
    state::{Market, UserLoan},
};

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump,
        constraint = !market.paused @ LendingError::MarketPaused,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserLoan::SIZE,
        seeds = [USER_LOAN_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_loan: Account<'info, UserLoan>,

    #[account(
        address = market.collateral_mint @ LendingError::MintMismatch,
    )]
    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = user,
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [COLLATERAL_VAULT_SEED],
        bump = market.collateral_vault_bump,
        address = market.collateral_vault @ LendingError::VaultMismatch,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;

    let user_loan = &mut ctx.accounts.user_loan;
    if user_loan.owner == Pubkey::default() {
        user_loan.owner = ctx.accounts.user.key();
        user_loan.bump = ctx.bumps.user_loan;
    }
    user_loan.last_update_ts = now;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_collateral_account.to_account_info(),
            to: ctx.accounts.collateral_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token_transfer(cpi_ctx, amount)?;

    user_loan.collateral = user_loan
        .collateral
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;
    market.total_collateral = market
        .total_collateral
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;

    msg!(
        "deposit: user={} amount={} new_total_collateral={}",
        ctx.accounts.user.key(),
        amount,
        user_loan.collateral,
    );
    Ok(())
}
