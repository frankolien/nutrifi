# NutriFi

> A Solana DeFi protocol: liquid staking + collateralised lending + permissionless liquidation. Two Anchor programs — **staking** (SOL → nSOL + NUT rewards) and **lending** (nSOL as collateral, mock USDC as debt). Paired with a React/Vite dashboard and two off-chain services (a CoinGecko-backed price oracle and a liquidation bot).

NutriFi lets users stake SOL and receive a liquid receipt token (`nSOL`) that earns a second reward token (`NUT`) over time. That `nSOL` plugs straight into the lending program as collateral — deposit it, borrow a stable (mock USDC), and if the collateral value drops below the liquidation threshold, a liquidator (bot or human) can repay part of the debt and seize collateral at a discount.

![Dashboard](https://github.com/user-attachments/assets/94aa5856-123d-4072-804c-6d4f2a21fc4b)

This repo is structured for someone who wants to *read the code and learn*. Every file has a header comment explaining what it does and why, and the interest-accrual + health-factor math in particular is documented inline so you can compare it to Compound/Aave if you want to go deep.

## Stack

| Layer            | Tech                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| On-chain         | Rust, Anchor 0.31.1, Solana 1.18.x                                         |
| Off-chain        | Node.js 20, TypeScript, ts-node, ioredis-free (no DB — pure process)       |
| Web app          | Vite, React 18, TypeScript, Tailwind, TanStack Query, react-router         |
| Wallet           | `@solana/wallet-adapter-react` (Phantom, Solflare, etc.)                   |
| On-chain reads   | Hand-written Borsh decoders in `app/src/lib/chain/decode.ts` (no IDL dep) |
| On-chain writes  | Hand-written instruction builders — same reason                            |
| Tests            | `anchor test` (mocha + chai) against `solana-test-validator`               |
| Live deploy      | Solana devnet (programs) + Vercel (web app)                                |

## What's in here

```
nutrifi/
├── Anchor.toml                   # Anchor workspace config
├── Cargo.toml                    # Rust workspace
├── programs/
│   ├── staking/                  # nutrifi_staking program
│   │   └── src/
│   │       ├── lib.rs            # program entrypoints
│   │       ├── constants.rs      # PDA seeds, rate precision, caps
│   │       ├── errors.rs         # typed StakingError codes
│   │       ├── state/
│   │       │   ├── config.rs     # singleton Config PDA + reward math
│   │       │   └── user_stake.rs # per-user PDA + checkpoint algorithm
│   │       └── instructions/
│   │           ├── initialize.rs
│   │           ├── stake.rs
│   │           ├── unstake.rs
│   │           ├── claim_rewards.rs
│   │           └── admin.rs      # set_reward_rate / set_paused / set_authority
│   └── lending/                  # nutrifi_lending program
│       └── src/
│           ├── lib.rs            # program entrypoints
│           ├── constants.rs      # bps denominator, index precision, caps
│           ├── errors.rs         # typed LendingError codes
│           ├── state/
│           │   ├── market.rs     # Market PDA + interest accrual
│           │   ├── user_loan.rs  # UserLoan PDA + scaled-debt math
│           │   ├── oracle.rs     # MockOracle (Pyth-shaped)
│           │   └── health.rs     # LTV + liquidation-threshold checks
│           └── instructions/
│               ├── initialize_market.rs
│               ├── oracle.rs     # initialize_oracle + set_price
│               ├── deposit_collateral.rs
│               ├── withdraw_collateral.rs
│               ├── borrow.rs
│               ├── repay.rs
│               ├── liquidate.rs
│               └── admin.rs      # set_params / set_paused / set_authority
├── services/                     # off-chain Node.js workspace
│   └── src/
│       ├── shared/               # env, logger, decoders, ix builders, health
│       ├── pricefeed/            # CoinGecko → set_price
│       └── bot/                  # loan scanner + liquidator
├── app/                          # Vite + React dashboard
│   └── src/
│       ├── lib/
│       │   ├── chain/            # borsh decoders, ix builders, errors, devSigner
│       │   ├── config.ts         # reads .bootstrap.json at build time
│       │   └── health.ts         # mirror of the on-chain health math
│       ├── hooks/                # useUserPosition, useProtocolStats, useStakingState, …
│       ├── components/           # primitives, layout chrome, ManageCard, Sidebar
│       ├── routes/               # Dashboard, Stake, Borrow, Markets, Liquidate, Activity
│       └── providers/            # ChainProvider (wallet adapter + react-query)
├── scripts/                      # deploy + bootstrap helpers (ts-node)
│   ├── bootstrap-all.ts          # creates mints + oracle + market + staking Config
│   ├── bootstrap-market.ts       # lending-only bootstrap (older, kept for reference)
│   ├── seed-borrower.ts          # fund a test borrower; --crash drops the oracle price
│   ├── fund-liquidator.ts        # give the liquidator some USDC to repay with
│   ├── push-price.ts             # one-shot oracle update
│   └── mint-nsol-to.ts           # mint nSOL to any wallet (for demoing)
├── tests/
│   ├── nutrifi-staking.ts        # staking mocha tests
│   └── nutrifi-lending.ts        # lending + liquidation mocha tests
├── .bootstrap.json               # live state written by bootstrap-all (which mints, which market)
├── package.json
└── tsconfig.json
```

## How it works (high level)

Two tokens, one pool:

- **nSOL** — liquid-staking receipt. Minted 1:1 on first deposit, then priced by the appreciating peg `total_staked_lamports / nsol_supply`.
- **NUT** — reward token. Emitted per staked lamport per second according to `reward_rate`.

Rewards use the **per-lamport index** algorithm (Compound/Aave v2 style):

- Globally we track `reward_index`, a `u128` that monotonically grows. Each second the index gains `reward_rate / SECONDS_PER_YEAR`.
- Every user records a `reward_index_checkpoint` — the value of `reward_index` the last time they acted.
- On any action (stake / unstake / claim) we do `earned = shares × (reward_index − checkpoint) / RATE_PRECISION`, fold it into `pending_rewards`, and bump the checkpoint.

This keeps per-user claim cost **O(1)** no matter how many stakers exist. That's why real protocols use it.

### PDAs

| PDA                   | Seeds                         | Purpose                              |
| --------------------- | ----------------------------- | ------------------------------------ |
| `Config`              | `["config"]`                  | singleton state + reward accumulator |
| SOL vault             | `["sol-vault"]`               | custodies staked SOL                 |
| nSOL mint authority   | `["nsol-mint-auth"]`          | signs nSOL mint/burn                 |
| NUT mint authority    | `["nut-mint-auth"]`           | signs NUT mint                       |
| `UserStake`           | `["user-stake", owner]`       | per-wallet shares + checkpoint       |

### Instructions

| ix                | signer    | what it does                              |
| ----------------- | --------- | ----------------------------------------- |
| `initialize`      | authority | create Config, wire mints, set reward rate |
| `stake`           | user      | SOL → vault, mint nSOL to user            |
| `unstake`         | user      | burn nSOL, SOL → user                     |
| `claim_rewards`   | user      | mint accrued NUT                          |
| `set_reward_rate` | authority | retune emission (capped at MAX_REWARD_RATE) |
| `set_paused`      | authority | freeze stake/unstake/claim                |
| `set_authority`   | authority | hand over admin key                       |

## Lending program

Takes nSOL as collateral, mints a mock USDC as debt, and exposes a permissionless `liquidate` instruction so off-chain bots can close unhealthy positions.

### Risk model (all ratios in bps; 10_000 = 100%)

| Parameter                   | Meaning                                                           | Default |
| --------------------------- | ----------------------------------------------------------------- | ------- |
| `loan_to_value_bps`         | Max debt as a fraction of collateral value (gate for new borrows) | 75%     |
| `liquidation_threshold_bps` | Ratio at which a position becomes liquidatable                    | 80%     |
| `liquidation_bonus_bps`     | Discount the liquidator gets on seized collateral                 | +5%     |
| `close_factor_bps`          | Max share of a loan that can be repaid in one liquidation         | 50%     |
| `borrow_apr_bps`            | Fixed borrow APR, compounded per-second against `borrow_index`    | 5%      |

The gap between LTV (75%) and liquidation threshold (80%) is the borrower's safety buffer: a new borrow maxing out LTV doesn't become instantly liquidatable on the next block.

### Interest model

Aave v2 "scaled debt" pattern:

- Market stores a global `borrow_index` that grows monotonically with interest.
- Each `UserLoan` stores `scaled_debt = nominal_debt_at_borrow_time / borrow_index`, so interest accrues "for free" — nominal debt at any moment is just `scaled_debt × borrow_index`.
- This keeps per-user accrual O(1) and avoids having to iterate every loan.

Accrual runs at the top of every state-changing instruction. The increment is linear-approximated (good to a few bps/year) rather than true continuous compounding — acceptable for a tutorial protocol, replace with `rpow` for production.

### Health factor & liquidation

All LTV / threshold math is centralised in [`programs/lending/src/state/health.rs`](programs/lending/src/state/health.rs) — one source of truth, so it can't drift between `borrow`, `withdraw`, and `liquidate`.

```text
collateral_value_usdc = collateral_lamports × price / PRICE_PRECISION
max_borrow            = collateral_value × ltv_bps / BPS
liquidatable          = debt > collateral_value × liquidation_threshold_bps / BPS
seize_value           = repay × (1 + bonus_bps / BPS)
seize_tokens          = seize_value × PRICE_PRECISION / price
```

Price comes from a `MockOracle` PDA (seeded by `["oracle", collateral_mint]`) with a staleness cutoff. Swap this file for a Pyth adapter and nothing else in the program changes.

### Lending PDAs

| PDA                    | Seeds                         | Purpose                                  |
| ---------------------- | ----------------------------- | ---------------------------------------- |
| `Market`               | `["market"]`                  | singleton risk params + accumulators     |
| Collateral vault (TA)  | `["collat-vault"]`            | PDA-owned TokenAccount holding nSOL      |
| USDC mint authority    | `["usdc-mint-auth"]`          | signs mock USDC mint/burn                |
| `UserLoan`             | `["user-loan", owner]`        | per-borrower position                    |
| `MockOracle`           | `["oracle", collateral_mint]` | price feed                               |

### Lending instructions

| ix                    | signer      | effect                                          |
| --------------------- | ----------- | ----------------------------------------------- |
| `initialize_market`   | authority   | create Market, vault, risk params               |
| `initialize_oracle`   | anyone      | register a mock price feed                      |
| `set_price`           | oracle auth | publish a new price                             |
| `deposit_collateral`  | user        | nSOL → vault                                    |
| `withdraw_collateral` | user        | vault → user (LTV-checked)                      |
| `borrow`              | user        | mint USDC against collateral (LTV-checked)      |
| `repay`               | user        | burn USDC, reduce debt                          |
| `liquidate`           | liquidator  | 3rd-party repays + seizes collateral at discount |
| `set_params`          | authority   | retune APR / LTV / threshold / bonus / close    |
| `set_paused`          | authority   | freeze the market                               |
| `set_authority`       | authority   | rotate the admin key                            |

## Off-chain services

Production-shape Node.js workspace under [services/](services/) with two long-running processes:

| Service        | What it does                                                      |
| -------------- | ----------------------------------------------------------------- |
| **pricefeed**  | polls CoinGecko, posts `set_price` on the mock oracle             |
| **bot**        | scans every `UserLoan`, liquidates any that crosses the threshold |

Both share a [`services/src/shared/`](services/src/shared/) module with hand-written Borsh decoders and instruction encoders — no dependency on Anchor's generated IDL so the services compile standalone. See [services/README.md](services/README.md) for the full story.

Quick start:

```bash
cd services
yarn install
cp .env.example .env       # fill in WALLET_PATH, COLLATERAL_MINT, DEBT_MINT, LENDING_PROGRAM_ID
yarn pricefeed             # one terminal
yarn bot                   # another terminal (dry-run by default)
```

The bot defaults to dry-run (`BOT_DRY_RUN=true`) — it logs what it would do but sends no transactions until you flip the flag.

## Fresh-machine setup (macOS / Linux)

You'll need Rust, the Solana CLI, Anchor, and Node.

### 1. Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup component add rustfmt clippy
```

### 2. Solana CLI

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.17/install)"
# add to PATH as prompted, then:
solana --version

# local dev wallet
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url localhost
```

### 3. Anchor (via avm — the version manager)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.31.1
avm use 0.31.1
anchor --version   # anchor-cli 0.31.1
```

### 4. Node (v18+) & yarn

```bash
# macOS — via homebrew
brew install node
npm install -g yarn
```

### 5. Clone + install

```bash
git clone <this repo> nutrifi
cd nutrifi
yarn install
```

### 6. Build & test

```bash
# build the Anchor program
anchor build

# run integration tests (auto-starts a local validator)
anchor test
```

If `anchor test` fails with a port-in-use error, a previous validator is still running — `pkill -9 solana-test-validator` and retry.

## A note on program IDs

The IDs in [Anchor.toml](Anchor.toml) (`221frxT7…` for staking, `EgYyi4Ht…` for lending) match the keypairs committed at [target/deploy/*.json](target/deploy/) and are live on devnet. If you fork this repo and want fresh IDs:

```bash
rm target/deploy/nutrifi_*-keypair.json
anchor build                # regenerates keypairs
anchor keys list            # prints the new IDs
```

Then paste the new IDs into `Anchor.toml` ([programs.localnet] and [programs.devnet]) **and** into the `declare_id!` in each `programs/*/src/lib.rs`. Rebuild. Standard Anchor workflow — skip it and you'll hit `DeclaredProgramIdMismatch`.

## Web app

Single-page dashboard under [app/](app/). Wallet-adapter handles Phantom / Solflare / etc.; all on-chain reads are **direct RPC** through TanStack Query — no indexer, no backend.

![Borrow tab with preview rows](https://github.com/user-attachments/assets/b935b099-ba86-4ffa-b21e-1ee4874cffb4)

### Routes

| Route         | What it shows                                                                   |
| ------------- | ------------------------------------------------------------------------------- |
| `/`           | Dashboard: 4 KPI cards (net, health, projected yield, nSOL price), action card  |
| `/stake`      | Stake detail + claim NUT rewards                                                 |
| `/borrow`     | Collateral/debt detail with full health breakdown                                |
| `/markets`    | Live `Market` account read — 2 rows (nSOL, USDC)                                 |
| `/liquidate`  | `getProgramAccounts` scanner for loans with health < 1×; one-click liquidate    |
| `/activity`   | `getSignaturesForAddress` on your `UserLoan` PDA, classified + linked to Explorer |

![Markets table](https://github.com/user-attachments/assets/6da52311-4474-4c36-ba81-3c70969cf08e)

![Liquidate page with an unhealthy loan](https://github.com/user-attachments/assets/46446ce0-bc65-474d-8ca5-a3052c02baa8)

### Live data hooks

Each hook reads an account (or several in a single `getMultipleAccountsInfo` call), runs a hand-written Borsh decoder, and exposes typed data:

| Hook                          | Sources                                                          | Refetch |
| ----------------------------- | ---------------------------------------------------------------- | ------- |
| `useUserPosition`             | Market + UserLoan + Oracle + wallet SOL + two ATAs (one RPC call) | 5s      |
| `useProtocolStats`            | Market + Oracle                                                  | 5s      |
| `useStakingState`             | Staking Config + UserStake; live-accrues pending NUT client-side | 5s      |
| `useRecentActivity`           | `getSignaturesForAddress` on UserLoan + classifier               | 10s     |
| `useLiquidationOpportunities` | `getProgramAccounts` with UserLoan discriminator memcmp filter   | 10s     |
| `useSlot`                     | `connection.getSlot("processed")` — drives the "synced block" footer | 3s      |

### Transaction sending

`useSendTx` ([app/src/hooks/useSendTx.ts](app/src/hooks/useSendTx.ts)) wraps TanStack Query's `useMutation`. It:

1. Optionally prepends `createAssociatedTokenAccountIdempotent` ixs for any mints the tx touches.
2. Fetches a fresh blockhash, simulates, and surfaces the sim logs on failure.
3. Falls back to a **dev signer** loaded from `VITE_DEV_SIGNER_SECRET` when one is present (localnet-only — browser wallets can't reach `127.0.0.1:8899`). A `import.meta.env.PROD` guard ensures this code path is dead-stripped in production builds.
4. Invalidates every chain-reading query on success so the UI updates immediately.

### Responsive design

`md` breakpoint is the pivot: tables become card stacks, the 6-item nav collapses into a hamburger drawer, KPI cards go from 4×1 to 2×2, the action-card's 4-mode segmented control gains horizontal scroll. See [app/src/components/layout/TopNav.tsx](app/src/components/layout/TopNav.tsx) and the `md:hidden` / `hidden md:*` pairs across the routes.

<img src="https://github.com/user-attachments/assets/0645b83a-5f0e-4a25-9c35-1a98ad86f213" alt="Mobile dashboard" width="375" />

## Devnet deployment

Both programs are deployed to devnet at their original program IDs (same keypairs from localnet — the declare_id's in the program source never changed):

| Program          | ID                                              |
| ---------------- | ----------------------------------------------- |
| `nutrifi_staking` | `221frxT7k1xFtwd4y7iWimUxiBe97zdte61mX7NTkkt9` |
| `nutrifi_lending` | `EgYyi4Htyoe7AVDBKfFD8T2LxswDfK6BVYt7vvCXSFtK` |

<!-- TODO: paste the live Vercel URL here once it's deployed -->

### Redeploying

```bash
# fund the deploy key (needs ~6 SOL on devnet)
solana airdrop 5 --url devnet

# build + deploy both programs
anchor build
solana program deploy --url devnet \
  --program-id target/deploy/nutrifi_lending-keypair.json \
  target/deploy/nutrifi_lending.so
solana program deploy --url devnet \
  --program-id target/deploy/nutrifi_staking-keypair.json \
  target/deploy/nutrifi_staking.so

# bootstrap mints + oracle + market on devnet
RPC_URL=https://api.devnet.solana.com yarn bootstrap-all

# post an initial price
yarn push-price 150000000

# build + deploy the web app
cd app
yarn build
vercel --prod
```

> **Heads up**: `app/src/bootstrap.json` is a real file on devnet (not a symlink to `.bootstrap.json`), because Vercel's build sandbox doesn't follow symlinks outside the project root. When you re-bootstrap, copy the new `.bootstrap.json` into `app/src/bootstrap.json` before redeploying.

## Scripts reference

All scripts live in [scripts/](scripts/) and honour `RPC_URL` (defaults to localnet) and `WALLET_PATH` (defaults to `~/.config/solana/id.json`). Run via `yarn <name>` from the repo root.

| Script              | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `bootstrap-all`     | Creates nSOL + NUT + mock-USDC mints, initializes staking Config and lending Market + Oracle, writes `.bootstrap.json`. Run once per cluster. |
| `bootstrap-market`  | Older single-program bootstrap. Kept for reference; `bootstrap-all` supersedes it. |
| `seed-borrower`     | Mints test nSOL to a fresh borrower, deposits it, borrows up near the LTV cap. `--crash` then drops the oracle price so the loan goes unhealthy. |
| `fund-liquidator`   | Mints nSOL + deposits + borrows USDC into the liquidator wallet so it has USDC to repay with. |
| `push-price`        | One-shot oracle update. Use between demos if the 5-min staleness kicks in.        |
| `mint-nsol-to`      | Mint arbitrary nSOL to a wallet (for giving a demo user a starting balance).      |

## Off-chain services: running them

Both live under [services/](services/).

```bash
cd services
yarn install
cp .env.example .env          # fill WALLET_PATH + program IDs + mint addresses
yarn pricefeed                # one terminal
yarn bot                      # another terminal (dry-run by default)
```

The bot defaults to `BOT_DRY_RUN=true` — it logs what it *would* do without sending anything. Flip to `false` once you trust it.

Neither service runs in production for the devnet demo. The oracle stays fresh only while `yarn pricefeed` is running locally; after 5 minutes of silence, on-chain reads start reverting with `StaleOracle`. For demos, push a manual price with `yarn push-price` instead of hosting the feed.

## Security caveats

This is a learning / portfolio project. It has not been audited. Known things I'd tighten before real money:

- Reward index uses `u128` with 12-decimal precision — fine for realistic pool sizes, but a formal overflow analysis hasn't been done at max supply.
- No timelock on `set_authority` / `set_reward_rate` — a real protocol would gate these behind a multisig + delay.
- `sol_for_nsol` truncates division; worst-case the last unstaker can lose 1 lamport of dust. Acceptable for lamports, would need revisiting for lower-decimal collateral in the lending program.
- The web app's dev signer (`VITE_DEV_SIGNER_SECRET`) is localnet-only and tree-shaken out of production builds via a `import.meta.env.PROD` guard — but if you ever build with `--mode development` and deploy that, the guard vanishes. Don't.
- The CoinGecko pricefeed has no circuit breaker — if the API starts returning bad data the oracle will happily publish it. In production you'd want a median-of-N source + sanity bounds.
