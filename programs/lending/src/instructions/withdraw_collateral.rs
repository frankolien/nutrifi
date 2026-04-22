//! `withdraw_collateral` — user pulls nSOL back out.
//!
//! Must pass the LTV check post-withdrawal. The vault is a PDA-owned
//! TokenAccount, so the transfer is signed by the vault's own seeds.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer as token_transfer, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::{COLLATERAL_VAULT_SEED, MARKET_SEED, ORACLE_SEED, USER_LOAN_SEED},
    errors::LendingError,
    state::{health, Market, MockOracle, UserLoan},
};

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
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

    /// CHECK: Anchor has_one above ties this to user_loan.owner.
    pub owner: UncheckedAccount<'info>,

    #[account(
        address = market.collateral_mint @ LendingError::MintMismatch,
    )]
    pub collateral_mint: Account<'info, Mint>,

    #[account(
        seeds = [ORACLE_SEED, collateral_mint.key().as_ref()],
        bump = oracle.bump,
        address = market.oracle @ LendingError::OracleMismatch,
    )]
    pub oracle: Account<'info, MockOracle>,

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
}

pub fn handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.accrue_interest(now)?;

    let user_loan = &mut ctx.accounts.user_loan;
    require!(
        user_loan.collateral >= amount,
        LendingError::InsufficientCollateral
    );

    // Speculatively subtract so the LTV check sees the post-withdraw state.
    user_loan.collateral = user_loan.collateral - amount;
    let price = ctx.accounts.oracle.read(now)?;
    health::ensure_ltv(user_loan, market, price).map_err(|_| LendingError::WithdrawExceedsLtv)?;

    // CPI: vault -> user, signed by the vault PDA's own seeds. The vault's
    // `authority` is itself (see `initialize_market`) because it's a
    // PDA-owned TokenAccount — `authority = collateral_vault`.
    let vault_bump = market.collateral_vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[COLLATERAL_VAULT_SEED, &[vault_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.user_collateral_account.to_account_info(),
            authority: ctx.accounts.collateral_vault.to_account_info(),
        },
        signer_seeds,
    );
    token_transfer(cpi_ctx, amount)?;

    market.total_collateral = market
        .total_collateral
        .checked_sub(amount)
        .ok_or(LendingError::MathOverflow)?;
    user_loan.last_update_ts = now;

    msg!(
        "withdraw: user={} amount={} remaining_collateral={}",
        ctx.accounts.user.key(),
        amount,
        user_loan.collateral,
    );
    Ok(())
}
