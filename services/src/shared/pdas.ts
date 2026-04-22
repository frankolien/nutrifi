/**
 * PDA derivation helpers — **must** stay in lockstep with the seed
 * constants in both programs:
 *   - programs/lending/src/constants.rs
 *   - programs/staking/src/constants.rs
 *
 * If a seed changes on-chain, change it here too or you'll derive the
 * wrong address and every call will fail with `AccountNotInitialized`.
 */

import { PublicKey } from "@solana/web3.js";

// -- Lending --
export const MARKET_SEED = Buffer.from("market");
export const COLLATERAL_VAULT_SEED = Buffer.from("collat-vault");
export const USDC_MINT_AUTH_SEED = Buffer.from("usdc-mint-auth");
export const USER_LOAN_SEED = Buffer.from("user-loan");
export const ORACLE_SEED = Buffer.from("oracle");

// -- Staking --
export const CONFIG_SEED = Buffer.from("config");
export const SOL_VAULT_SEED = Buffer.from("sol-vault");
export const NSOL_MINT_AUTH_SEED = Buffer.from("nsol-mint-auth");
export const NUT_MINT_AUTH_SEED = Buffer.from("nut-mint-auth");
export const USER_STAKE_SEED = Buffer.from("user-stake");

export function lendingPdas(programId: PublicKey, collateralMint: PublicKey) {
  const [market] = PublicKey.findProgramAddressSync([MARKET_SEED], programId);
  const [collateralVault] = PublicKey.findProgramAddressSync(
    [COLLATERAL_VAULT_SEED],
    programId,
  );
  const [usdcMintAuthority] = PublicKey.findProgramAddressSync(
    [USDC_MINT_AUTH_SEED],
    programId,
  );
  const [oracle] = PublicKey.findProgramAddressSync(
    [ORACLE_SEED, collateralMint.toBuffer()],
    programId,
  );
  return { market, collateralVault, usdcMintAuthority, oracle };
}

export function userLoanPda(
  programId: PublicKey,
  owner: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_LOAN_SEED, owner.toBuffer()],
    programId,
  );
  return pda;
}

export function stakingPdas(programId: PublicKey) {
  const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  const [solVault] = PublicKey.findProgramAddressSync(
    [SOL_VAULT_SEED],
    programId,
  );
  const [nsolMintAuthority] = PublicKey.findProgramAddressSync(
    [NSOL_MINT_AUTH_SEED],
    programId,
  );
  const [nutMintAuthority] = PublicKey.findProgramAddressSync(
    [NUT_MINT_AUTH_SEED],
    programId,
  );
  return { config, solVault, nsolMintAuthority, nutMintAuthority };
}
