//! `borrow` — user mints mock USDC against posted collateral.
//!
//! Steps:
//! 1. Accrue interest.
//! 2. Scale `amount` into the index-normalised representation and add to
//!    both `user_loan.scaled_debt` and `market.total_scaled_debt`.
//! 3. Verify the new position still clears LTV at the current oracle price.
//! 4. Mint USDC to the user, signed by the USDC mint authority PDA.

use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

use crate::{
    constants::{MARKET_SEED, ORACLE_SEED, USDC_MINT_AUTH_SEED, USER_LOAN_SEED},
    errors::LendingError,
    state::{health, Market, MockOracle, UserLoan},
};

#[derive(Accounts)]
pub struct Borrow<'info> {
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

    /// CHECK: has_one above ties this to user_loan.owner.
    pub owner: UncheckedAccount<'info>,

    /// Oracle for the collateral mint — identified by `market.oracle`.
    #[account(
        seeds = [ORACLE_SEED, market.collateral_mint.as_ref()],
        bump = oracle.bump,
        address = market.oracle @ LendingError::OracleMismatch,
    )]
    pub oracle: Account<'info, MockOracle>,

    #[account(
        mut,
        address = market.debt_mint @ LendingError::MintMismatch,
    )]
    pub debt_mint: Account<'info, Mint>,

    /// CHECK: PDA — signs USDC mint CPI via seeds.
    #[account(
        seeds = [USDC_MINT_AUTH_SEED],
        bump = market.usdc_mint_auth_bump,
    )]
    pub usdc_mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = debt_mint,
        token::authority = user,
    )]
    pub user_debt_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;

    let user_loan = &mut ctx.accounts.user_loan;
    let scaled_delta = UserLoan::to_scaled(amount, market.borrow_index)?;

    user_loan.scaled_debt = user_loan
        .scaled_debt
        .checked_add(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;
    market.total_scaled_debt = market
        .total_scaled_debt
        .checked_add(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;

    let price = ctx.accounts.oracle.read(now)?;
    health::ensure_ltv(user_loan, market, price)?;

    // Mint USDC to user, signer = usdc mint authority PDA.
    let auth_bump = market.usdc_mint_auth_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[USDC_MINT_AUTH_SEED, &[auth_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.debt_mint.to_account_info(),
            to: ctx.accounts.user_debt_account.to_account_info(),
            authority: ctx.accounts.usdc_mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    mint_to(cpi_ctx, amount)?;

    user_loan.last_update_ts = now;

    msg!(
        "borrow: user={} amount={} scaled_debt={} total_scaled={}",
        ctx.accounts.user.key(),
        amount,
        user_loan.scaled_debt,
        market.total_scaled_debt,
    );
    Ok(())
}
