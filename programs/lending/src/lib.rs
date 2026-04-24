//! # NutriFi Lending Program
//!
//! Accepts nSOL (minted by the staking program) as collateral; allows the
//! depositor to borrow a mock USDC against it. Third parties can
//! liquidate undercollateralised positions at a discount.
//!
//! ## Instructions
//!
//! | ix                   | signer      | effect                                          |
//! |----------------------|-------------|-------------------------------------------------|
//! | `initialize_market`  | authority   | create Market, vault, params                    |
//! | `initialize_oracle`  | anyone*     | register a mock price feed                      |
//! | `set_price`          | oracle auth | publish a new price                             |
//! | `deposit_collateral` | user        | nSOL → vault                                    |
//! | `withdraw_collateral`| user        | vault → user (LTV-checked)                      |
//! | `borrow`             | user        | mint USDC against collateral                    |
//! | `repay`              | user        | burn USDC, reduce debt                          |
//! | `liquidate`          | liquidator  | 3rd-party repays, seizes collateral at discount |
//! | `set_params`         | authority   | retune APR / LTV / threshold / bonus / close    |
//! | `set_paused`         | authority   | freeze the market                               |
//! | `set_authority`      | authority   | rotate the admin key                            |
//!
//! *`initialize_oracle` takes its own `authority` — typically an off-chain
//! price-poster bot or the protocol admin.
//!
//! ## PDAs
//!
//! | PDA                    | Seeds                          |
//! |------------------------|--------------------------------|
//! | Market                 | `["market"]`                   |
//! | Collateral vault (TA)  | `["collat-vault"]`             |
//! | USDC mint authority    | `["usdc-mint-auth"]`           |
//! | UserLoan               | `["user-loan", owner]`         |
//! | MockOracle             | `["oracle", collateral_mint]`  |
//!
//! ## How the math is organised
//!
//! * Debt uses the Aave v2 "scaled debt" pattern: each user stores a
//!   time-invariant `scaled_debt`, and the global `borrow_index` accrues
//!   interest on every state-mutating call. Nominal debt at any point is
//!   `scaled_debt × borrow_index / INDEX_PRECISION`.
//! * Health checks live in [`state::health`] — a single module owns all
//!   LTV / liquidation-threshold math so it can't drift between
//!   instructions.
//! * Prices are denominated in `PRICE_PRECISION` (1e6 == USDC decimals)
//!   per **smallest collateral unit**, which lets health math avoid
//!   decimal-juggling entirely.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("EgYyi4Htyoe7AVDBKfFD8T2LxswDfK6BVYt7vvCXSFtK");

#[program]
pub mod nutrifi_lending {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        params: MarketParams,
    ) -> Result<()> {
        instructions::initialize_market::handler(ctx, params)
    }

    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        initial_price: u128,
        max_staleness_seconds: i64,
    ) -> Result<()> {
        instructions::oracle::initialize_oracle(ctx, initial_price, max_staleness_seconds)
    }

    pub fn set_price(ctx: Context<SetPrice>, new_price: u128) -> Result<()> {
        instructions::oracle::set_price(ctx, new_price)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::deposit_collateral::handler(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        instructions::withdraw_collateral::handler(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        instructions::borrow::handler(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        instructions::repay::handler(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        instructions::liquidate::handler(ctx, repay_amount)
    }

    pub fn set_params(ctx: Context<AdminOnly>, params: MarketParams) -> Result<()> {
        instructions::admin::set_params(ctx, params)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_authority(ctx: Context<SetAuthority>) -> Result<()> {
        instructions::admin::set_authority(ctx)
    }
}
