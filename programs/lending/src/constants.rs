//! Protocol-wide constants for the lending market.
//!
//! All ratios are expressed in **basis points** (bps): `10_000` = 100%.
//! Prices use a separate **`PRICE_PRECISION`** scale to keep oracle math
//! independent of ratio math.

use anchor_lang::prelude::*;

/// Seed for the singleton [`Market`](crate::state::Market) PDA.
#[constant]
pub const MARKET_SEED: &[u8] = b"market";

/// Seed for the collateral vault (holds deposited nSOL in a TokenAccount PDA).
#[constant]
pub const COLLATERAL_VAULT_SEED: &[u8] = b"collat-vault";

/// Seed for the mock-USDC mint authority PDA.
#[constant]
pub const USDC_MINT_AUTH_SEED: &[u8] = b"usdc-mint-auth";

/// Seed for per-user [`UserLoan`](crate::state::UserLoan) PDAs.
#[constant]
pub const USER_LOAN_SEED: &[u8] = b"user-loan";

/// Seed for the mock oracle PDA (one per collateral mint).
#[constant]
pub const ORACLE_SEED: &[u8] = b"oracle";

/// Ratio precision — 10_000 = 100%. Used for LTV, liquidation threshold,
/// close factor, liquidation bonus.
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Price scale: 1.0 == 1_000_000 (6 decimals). Chosen to match USDC so
/// that `(nsol_amount × price) / PRICE_PRECISION` lands directly in
/// 6-decimal USDC units with no further scaling.
pub const PRICE_PRECISION: u128 = 1_000_000;

/// Interest index precision — 18 decimals, Aave v3 / Euler style.
/// u128 with 18-decimal scale handles any realistic debt size without
/// overflowing during per-second compounding.
pub const INDEX_PRECISION: u128 = 1_000_000_000_000_000_000;

/// Initial value of the borrow index at market genesis (== 1.0).
pub const INITIAL_BORROW_INDEX: u128 = INDEX_PRECISION;

/// Seconds per year — denominator for APR-style interest accrual.
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Upper bound on any bps parameter stored on the market. Anything above
/// 100% is almost certainly a config error, so we reject at the boundary.
pub const MAX_BPS: u64 = 10_000;

/// Hard cap on the borrow APR (bps). 500% is the ceiling — prevents an
/// authority mistake from wiping loans on the next accrual tick.
pub const MAX_BORROW_APR_BPS: u64 = 50_000;

/// Upper bound on the price an oracle can report, in `PRICE_PRECISION`
/// units. Equivalent to ~$1e13 per unit of collateral, which is a sanity
/// check against an oracle miscompute, not a business rule.
pub const MAX_ORACLE_PRICE: u128 = 10_000_000_000 * PRICE_PRECISION;
