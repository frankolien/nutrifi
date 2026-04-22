//! `liquidate` — a third-party (the *liquidator*) repays part of an
//! unhealthy borrower's debt and receives collateral at a discount.
//!
//! Mechanics (Aave v2 style):
//!
//! 1. Accrue interest.
//! 2. Assert `ensure_liquidatable` — debt/collateral ratio must have
//!    crossed `liquidation_threshold_bps`. Otherwise revert so nobody can
//!    seize collateral from a healthy account.
//! 3. Compute max repayable = `close_factor_bps × outstanding`. The
//!    caller's `repay_amount` is clamped to that.
//! 4. Seize collateral worth `repay_amount × (1 + liquidation_bonus)`,
//!    converted to collateral units via the oracle price.
//! 5. Guard against seizing more than the borrower has — if the bonus
//!    would overdraw, clamp collateral to what's available and let the
//!    liquidator's profit shrink. (In production you'd also write off
//!    the residual debt as bad debt; we leave the remaining scaled_debt
//!    in place here.)
//! 6. Burn USDC from liquidator, transfer collateral vault → liquidator.

use anchor_lang::prelude::*;
use anchor_spl::token::{
    burn, transfer as token_transfer, Burn, Mint, Token, TokenAccount, Transfer,
};

use crate::{
    constants::{
        BPS_DENOMINATOR, COLLATERAL_VAULT_SEED, MARKET_SEED, ORACLE_SEED, USER_LOAN_SEED,
    },
    errors::LendingError,
    state::{health, Market, MockOracle, UserLoan},
};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump,
        constraint = !market.paused @ LendingError::MarketPaused,
    )]
    pub market: Account<'info, Market>,

    /// Borrower whose loan is being liquidated. Not a signer.
    /// CHECK: matched against `user_loan.owner` via has_one.
    pub borrower: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [USER_LOAN_SEED, borrower.key().as_ref()],
        bump = user_loan.bump,
        constraint = user_loan.owner == borrower.key() @ LendingError::Unauthorized,
    )]
    pub user_loan: Account<'info, UserLoan>,

    #[account(
        seeds = [ORACLE_SEED, market.collateral_mint.as_ref()],
        bump = oracle.bump,
        address = market.oracle @ LendingError::OracleMismatch,
    )]
    pub oracle: Account<'info, MockOracle>,

    #[account(
        address = market.collateral_mint @ LendingError::MintMismatch,
    )]
    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = market.debt_mint @ LendingError::MintMismatch,
    )]
    pub debt_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [COLLATERAL_VAULT_SEED],
        bump = market.collateral_vault_bump,
        address = market.collateral_vault @ LendingError::VaultMismatch,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Liquidator's USDC — burned to cover debt.
    #[account(
        mut,
        token::mint = debt_mint,
        token::authority = liquidator,
    )]
    pub liquidator_debt_account: Account<'info, TokenAccount>,

    /// Liquidator's nSOL — receives seized collateral.
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = liquidator,
    )]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
    require!(repay_amount > 0, LendingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;

    let user_loan = &mut ctx.accounts.user_loan;
    let price = ctx.accounts.oracle.read(now)?;

    // Gate: the position must be below the liquidation threshold.
    health::ensure_liquidatable(user_loan, market, price)?;

    // Close-factor clamp — Aave uses 50%; prevents a liquidator from
    // fully draining an account in one go.
    let outstanding = user_loan.nominal_debt(market.borrow_index)?;
    let max_repay_by_close_factor =
        ((outstanding as u128) * (market.close_factor_bps as u128) / BPS_DENOMINATOR as u128) as u64;
    require!(
        repay_amount <= max_repay_by_close_factor,
        LendingError::CloseFactorExceeded
    );

    // Work out the collateral the liquidator is entitled to:
    //
    //   seize_value  = repay_amount * (1 + bonus_bps / BPS)
    //   seize_tokens = seize_value  / price   (in collateral units)
    let bonus_numerator = (BPS_DENOMINATOR + market.liquidation_bonus_bps) as u128;
    let seize_value = (repay_amount as u128)
        .checked_mul(bonus_numerator)
        .ok_or(LendingError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    let mut seize_tokens = health::collateral_for_value(seize_value, price)?;

    // Clamp to what the borrower actually has. If we had to clamp, the
    // liquidator loses part of the bonus — that's the correct behaviour
    // (they can still profit up to the borrower's remaining collateral).
    if seize_tokens > user_loan.collateral {
        seize_tokens = user_loan.collateral;
    }
    require!(
        seize_tokens > 0,
        LendingError::SeizeExceedsCollateral
    );

    // 1. Burn liquidator's USDC.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.debt_mint.to_account_info(),
            from: ctx.accounts.liquidator_debt_account.to_account_info(),
            authority: ctx.accounts.liquidator.to_account_info(),
        },
    );
    burn(cpi_ctx, repay_amount)?;

    // 2. Vault → liquidator, signed by the vault PDA (self-auth).
    let vault_bump = market.collateral_vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[COLLATERAL_VAULT_SEED, &[vault_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.liquidator_collateral_account.to_account_info(),
            authority: ctx.accounts.collateral_vault.to_account_info(),
        },
        signer_seeds,
    );
    token_transfer(cpi_ctx, seize_tokens)?;

    // 3. Book-keeping: reduce borrower's debt and collateral, market totals.
    let scaled_delta = UserLoan::to_scaled(repay_amount, market.borrow_index)?;
    user_loan.scaled_debt = user_loan
        .scaled_debt
        .checked_sub(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;
    user_loan.collateral = user_loan
        .collateral
        .checked_sub(seize_tokens)
        .ok_or(LendingError::MathOverflow)?;
    market.total_scaled_debt = market
        .total_scaled_debt
        .checked_sub(scaled_delta)
        .ok_or(LendingError::MathOverflow)?;
    market.total_collateral = market
        .total_collateral
        .checked_sub(seize_tokens)
        .ok_or(LendingError::MathOverflow)?;
    user_loan.last_update_ts = now;

    msg!(
        "liquidate: borrower={} liquidator={} repaid={} seized={} price={}",
        ctx.accounts.borrower.key(),
        ctx.accounts.liquidator.key(),
        repay_amount,
        seize_tokens,
        price,
    );
    Ok(())
}
