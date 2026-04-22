//! [`MockOracle`] — a deliberately-simple price feed.
//!
//! Real deployments swap this for Pyth or Switchboard. The instruction
//! surface here mirrors what a Pyth adapter would expose — `price`,
//! `published_slot`, a max staleness — so the rest of the program can
//! stay identical when we switch providers.
//!
//! Price is in [`PRICE_PRECISION`](crate::constants::PRICE_PRECISION)
//! units of debt token per **one smallest unit** of collateral. Using the
//! smallest-unit convention (rather than "whole tokens") lets health
//! calculations avoid decimal-place juggling entirely:
//!
//! ```text
//! collateral_value_usdc = collateral_lamports * price / PRICE_PRECISION
//! ```

use anchor_lang::prelude::*;

use crate::errors::LendingError;

#[account]
#[derive(Default, Debug)]
pub struct MockOracle {
    /// Authority allowed to post prices — typically a price-feed bot.
    pub authority: Pubkey,

    /// Mint this oracle prices (nSOL in the first market).
    pub collateral_mint: Pubkey,

    /// Price per smallest collateral unit, scaled by `PRICE_PRECISION`.
    pub price: u128,

    /// Unix ts of the last update — used for staleness checks.
    pub published_ts: i64,

    /// Max age of a price (seconds) before reads error out with
    /// `OracleStale`. 300s is a reasonable default for on-chain feeds.
    pub max_staleness_seconds: i64,

    pub bump: u8,
}

impl MockOracle {
    pub const SIZE: usize = 8   // discriminator
        + 32                     // authority
        + 32                     // collateral_mint
        + 16                     // price
        + 8                      // published_ts
        + 8                      // max_staleness_seconds
        + 1; //                     bump

    /// Read the price, failing if it's stale or zero.
    pub fn read(&self, now: i64) -> Result<u128> {
        require!(self.price > 0, LendingError::OracleStale);
        require!(
            now.saturating_sub(self.published_ts) <= self.max_staleness_seconds,
            LendingError::OracleStale,
        );
        Ok(self.price)
    }
}
