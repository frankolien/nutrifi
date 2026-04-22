//! `initialize_market` — bootstrap the lending market.
//!
//! Creates the singleton [`Market`] PDA, the collateral vault token
//! account PDA, and records risk parameters. The nSOL and USDC mints
//! must already exist; the USDC mint's authority must be the
//! `usdc-mint-auth` PDA so this program can mint on borrow / burn on
//! repay.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{
        COLLATERAL_VAULT_SEED, INITIAL_BORROW_INDEX, MARKET_SEED, MAX_BORROW_APR_BPS, MAX_BPS,
        USDC_MINT_AUTH_SEED,
    },
    errors::LendingError,
    state::Market,
};

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Market::SIZE,
        seeds = [MARKET_SEED],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mint::authority = usdc_mint_authority,
    )]
    pub debt_mint: Account<'info, Mint>,

    /// CHECK: oracle PDA address — validated here, initialized separately.
    pub oracle: UncheckedAccount<'info>,

    /// CHECK: PDA — signs USDC mint/burn via seeds.
    #[account(
        seeds = [USDC_MINT_AUTH_SEED],
        bump,
    )]
    pub usdc_mint_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = collateral_vault,
        seeds = [COLLATERAL_VAULT_SEED],
        bump,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct MarketParams {
    pub borrow_apr_bps: u64,
    pub loan_to_value_bps: u64,
    pub liquidation_threshold_bps: u64,
    pub liquidation_bonus_bps: u64,
    pub close_factor_bps: u64,
}

impl MarketParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.borrow_apr_bps <= MAX_BORROW_APR_BPS,
            LendingError::AprTooHigh
        );
        require!(self.loan_to_value_bps <= MAX_BPS, LendingError::RatioTooHigh);
        require!(
            self.liquidation_threshold_bps <= MAX_BPS,
            LendingError::RatioTooHigh
        );
        require!(
            self.liquidation_bonus_bps <= MAX_BPS,
            LendingError::RatioTooHigh
        );
        require!(self.close_factor_bps <= MAX_BPS, LendingError::RatioTooHigh);
        require!(
            self.liquidation_threshold_bps > self.loan_to_value_bps,
            LendingError::ThresholdBelowLtv
        );
        Ok(())
    }
}

pub fn handler(ctx: Context<InitializeMarket>, params: MarketParams) -> Result<()> {
    params.validate()?;

    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    market.authority = ctx.accounts.authority.key();
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.debt_mint = ctx.accounts.debt_mint.key();
    market.collateral_vault = ctx.accounts.collateral_vault.key();
    market.oracle = ctx.accounts.oracle.key();
    market.total_collateral = 0;
    market.total_scaled_debt = 0;
    market.borrow_index = INITIAL_BORROW_INDEX;
    market.last_update_ts = clock.unix_timestamp;
    market.borrow_apr_bps = params.borrow_apr_bps;
    market.loan_to_value_bps = params.loan_to_value_bps;
    market.liquidation_threshold_bps = params.liquidation_threshold_bps;
    market.liquidation_bonus_bps = params.liquidation_bonus_bps;
    market.close_factor_bps = params.close_factor_bps;
    market.paused = false;
    market.bump = ctx.bumps.market;
    market.collateral_vault_bump = ctx.bumps.collateral_vault;
    market.usdc_mint_auth_bump = ctx.bumps.usdc_mint_authority;

    msg!(
        "Market initialized: collat={} debt={} apr={}bps ltv={}bps liq={}bps bonus={}bps close={}bps",
        market.collateral_mint,
        market.debt_mint,
        market.borrow_apr_bps,
        market.loan_to_value_bps,
        market.liquidation_threshold_bps,
        market.liquidation_bonus_bps,
        market.close_factor_bps,
    );

    Ok(())
}
