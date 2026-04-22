//! `repay` — burn the user's USDC, reduce their debt.
//!
//! If `amount` exceeds the outstanding nominal debt (because the caller
//! passed `u64::MAX`, a common "full repay" pattern), we clamp to the
//! exact debt so the user isn't charged extra.

use anchor_lang::prelude::*;
use anchor_spl::token::{burn, Burn, Mint, Token, TokenAccount};

use crate::{
    constants::{MARKET_SEED, USER_LOAN_SEED},
    errors::LendingError,
    state::{Market, UserLoan},
};

#[derive(Accounts)]
pub struct Repay<'info> {
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
        mut,
        seeds = [USER_LOAN_SEED, user.key().as_ref()],
        bump = user_loan.bump,
        has_one = owner @ LendingError::Unauthorized,
    )]
    pub user_loan: Account<'info, UserLoan>,

    /// CHECK: has_one above.
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        address = market.debt_mint @ LendingError::MintMismatch,
    )]
    pub debt_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = debt_mint,
        token::authority = user,
    )]
    pub user_debt_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Repay>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;

    let user_loan = &mut ctx.accounts.user_loan;
    let outstanding = user_loan.nominal_debt(market.borrow_index)?;
    require!(outstanding > 0, LendingError::InsufficientDebt);
    let repay = amount.min(outstanding);

    // Burn the USDC from the user's token account.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.debt_mint.to_account_info(),
            from: ctx.accounts.user_debt_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    burn(cpi_ctx, repay)?;

    // If we're repaying the full outstanding amount, zero the scaled debt
    // exactly — avoids rounding drift that would leave a dust balance.
    let scaled_delta = if repay == outstanding {
        user_loan.scaled_debt
    } else {
        UserLoan::to_scaled(repay, market.borrow_index)?
    };

    user_loan.scaled_debt = user_loan
        .scaled_debt
        .checked_sub(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;
    market.total_scaled_debt = market
        .total_scaled_debt
        .checked_sub(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;
    user_loan.last_update_ts = now;

    msg!(
        "repay: user={} amount={} scaled_delta={} remaining_scaled={}",
        ctx.accounts.user.key(),
        repay,
        scaled_delta,
        user_loan.scaled_debt,
    );
    Ok(())
}
