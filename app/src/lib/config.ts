/**
 * On-chain config for the web app.
 *
 * Reads from `src/bootstrap.json` — a symlink to the repo-root
 * `.bootstrap.json` produced by `yarn bootstrap`. That file is the
 * single source of truth for *which* deployed market this app talks to.
 *
 * If you redeploy / re-bootstrap, Vite will pick up the new addresses
 * on its next dev-server reload. For production builds, the values are
 * baked in at build time.
 */

import { PublicKey } from "@solana/web3.js";
import bootstrap from "@/bootstrap.json";

export interface ChainConfig {
  cluster: string;
  lendingProgramId: PublicKey;
  stakingProgramId: PublicKey;
  collateralMint: PublicKey; // nSOL
  debtMint: PublicKey; // mock USDC
  /** Only populated after `yarn bootstrap-all`; legacy bootstraps leave it null. */
  nutMint: PublicKey | null;
  stakingConfig: PublicKey | null;
  solVault: PublicKey | null;
  nsolMintAuthority: PublicKey | null;
  nutMintAuthority: PublicKey | null;
  market: PublicKey;
  collateralVault: PublicKey;
  usdcMintAuthority: PublicKey;
  oracle: PublicKey;
  params: {
    initialPrice: bigint;
    maxStalenessSeconds: number;
    borrowAprBps: number;
    loanToValueBps: number;
    liquidationThresholdBps: number;
    liquidationBonusBps: number;
    closeFactorBps: number;
  };
}

// Staking section is only present after `yarn bootstrap-all`.
interface BootstrapStaking {
  config: string;
  solVault: string;
  nsolMintAuthority: string;
  nutMintAuthority: string;
  rewardRate: string;
}
const stakingBoot = (bootstrap as { staking?: BootstrapStaking }).staking;
const nutMint = (bootstrap as { nutMint?: string }).nutMint;

export const CONFIG: ChainConfig = {
  cluster: bootstrap.cluster,
  lendingProgramId: new PublicKey(bootstrap.lendingProgramId),
  stakingProgramId: new PublicKey(bootstrap.stakingProgramId),
  collateralMint: new PublicKey(bootstrap.nsolMint),
  debtMint: new PublicKey(bootstrap.usdcMint),
  nutMint: nutMint ? new PublicKey(nutMint) : null,
  stakingConfig: stakingBoot ? new PublicKey(stakingBoot.config) : null,
  solVault: stakingBoot ? new PublicKey(stakingBoot.solVault) : null,
  nsolMintAuthority: stakingBoot
    ? new PublicKey(stakingBoot.nsolMintAuthority)
    : null,
  nutMintAuthority: stakingBoot
    ? new PublicKey(stakingBoot.nutMintAuthority)
    : null,
  market: new PublicKey(bootstrap.market),
  collateralVault: new PublicKey(bootstrap.collateralVault),
  usdcMintAuthority: new PublicKey(bootstrap.usdcMintAuthority),
  oracle: new PublicKey(bootstrap.oracle),
  params: {
    initialPrice: BigInt(bootstrap.params.initialPrice),
    maxStalenessSeconds: bootstrap.params.maxStalenessSeconds,
    borrowAprBps: bootstrap.params.borrowAprBps,
    loanToValueBps: bootstrap.params.loanToValueBps,
    liquidationThresholdBps: bootstrap.params.liquidationThresholdBps,
    liquidationBonusBps: bootstrap.params.liquidationBonusBps,
    closeFactorBps: bootstrap.params.closeFactorBps,
  },
};

// PRICE_PRECISION matches programs/lending/src/constants.rs (1e6).
// Used to convert on-chain price → USDC-per-nSOL.
export const PRICE_PRECISION = 1_000_000n;
export const NSOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;
export const BPS = 10_000;

// Anchor account discriminator seeds (first 8 bytes of sha256("account:<Struct>")).
// We derive them at runtime in decode.ts rather than hardcode.

// PDA seeds — must match the on-chain programs.
export const USER_LOAN_SEED = new TextEncoder().encode("user-loan");
export const USER_STAKE_SEED = new TextEncoder().encode("user-stake");
