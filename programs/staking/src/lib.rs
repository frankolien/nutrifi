//! # NutriFi Staking Program
//!
//! Liquid-staking primitive for the NutriFi DeFi stack.
//!
//! Users deposit SOL into a PDA-owned vault and receive nSOL (an SPL token)
//! as a transferable receipt. A separate reward token (NUT) is emitted over
//! time to active stakers via a per-lamport reward index — the same O(1)
//! algorithm used by Compound/Aave so per-user claim cost stays constant
//! regardless of pool size.
//!
//! The nSOL is the building block the *lending* program (shipped later)
//! will accept as collateral.
//!
//! ## Instructions
//!
//! | ix                | signer    | effect                                   |
//! |-------------------|-----------|------------------------------------------|
//! | `initialize`      | authority | create Config, set reward rate           |
//! | `stake`           | user      | SOL → vault, mint nSOL                   |
//! | `unstake`         | user      | burn nSOL, SOL → user                    |
//! | `claim_rewards`   | user      | mint accrued NUT to user                 |
//! | `set_reward_rate` | authority | retune emission                          |
//! | `set_paused`      | authority | freeze stake/unstake/claim               |
//! | `set_authority`   | authority | hand over admin key                      |
//!
//! ## PDAs
//!
//! | name                 | seeds                            |
//! |----------------------|----------------------------------|
//! | Config               | `["config"]`                     |
//! | SOL vault            | `["sol-vault"]`                  |
//! | nSOL mint authority  | `["nsol-mint-auth"]`             |
//! | NUT mint authority   | `["nut-mint-auth"]`              |
//! | UserStake            | `["user-stake", owner]`          |

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("StkNUTriFi1111111111111111111111111111111111");

#[program]
pub mod nutrifi_staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, reward_rate: u64) -> Result<()> {
        instructions::initialize::handler(ctx, reward_rate)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, amount)
    }

    pub fn unstake(ctx: Context<Unstake>, nsol_amount: u64) -> Result<()> {
        instructions::unstake::handler(ctx, nsol_amount)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards::handler(ctx)
    }

    pub fn set_reward_rate(ctx: Context<AdminOnly>, new_rate: u64) -> Result<()> {
        instructions::admin::set_reward_rate(ctx, new_rate)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_authority(ctx: Context<SetAuthority>) -> Result<()> {
        instructions::admin::set_authority(ctx)
    }
}
