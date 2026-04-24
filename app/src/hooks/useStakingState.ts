/**
 * Read the staking `Config` singleton + the signer's `UserStake` account.
 *
 * Returns exchange rate, pending rewards (computed as of *now* by
 * accruing locally), and the user's nSOL shares. When staking isn't
 * initialized on this cluster, returns `null`.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { CONFIG, NSOL_DECIMALS, USER_STAKE_SEED } from "@/lib/config";
import { loadDevKeypair } from "@/lib/chain/devSigner";

// RATE_PRECISION = 1e12 in programs/staking/src/constants.rs.
const RATE_PRECISION = 1_000_000_000_000n;
// SECONDS_PER_YEAR (365.25 * 86400) — matches staking constants.
const SECONDS_PER_YEAR = 31_557_600n;

interface StakingConfigDecoded {
  totalStakedLamports: bigint;
  nsolSupply: bigint;
  rewardIndex: bigint;
  lastUpdateTs: bigint;
  rewardRate: bigint;
  paused: boolean;
}

interface UserStakeDecoded {
  owner: PublicKey;
  shares: bigint;
  rewardIndexCheckpoint: bigint;
  pendingRewards: bigint;
  lastCheckpointTs: bigint;
}

function decodeConfig(data: Uint8Array): StakingConfigDecoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Layout: 8 disc + 32 authority + 32 nsol_mint + 32 nut_mint + 32 sol_vault
  // + 8 total_staked + 8 nsol_supply + 16 reward_index + 8 last_update_ts
  // + 8 reward_rate + 1 paused + 1 bump + 1 sol_vault_bump + 1 + 1.
  let off = 8 + 32 + 32 + 32 + 32;
  const totalStakedLamports = view.getBigUint64(off, true);
  off += 8;
  const nsolSupply = view.getBigUint64(off, true);
  off += 8;
  const lo = view.getBigUint64(off, true);
  const hi = view.getBigUint64(off + 8, true);
  const rewardIndex = (hi << 64n) | lo;
  off += 16;
  const lastUpdateTs = view.getBigInt64(off, true);
  off += 8;
  const rewardRate = view.getBigUint64(off, true);
  off += 8;
  const paused = view.getUint8(off) !== 0;
  return {
    totalStakedLamports,
    nsolSupply,
    rewardIndex,
    lastUpdateTs,
    rewardRate,
    paused,
  };
}

function decodeUserStake(data: Uint8Array): UserStakeDecoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 8;
  const owner = new PublicKey(
    new Uint8Array(data.buffer, data.byteOffset + off, 32),
  );
  off += 32;
  const shares = view.getBigUint64(off, true);
  off += 8;
  const lo = view.getBigUint64(off, true);
  const hi = view.getBigUint64(off + 8, true);
  const rewardIndexCheckpoint = (hi << 64n) | lo;
  off += 16;
  const pendingRewards = view.getBigUint64(off, true);
  off += 8;
  const lastCheckpointTs = view.getBigInt64(off, true);
  return {
    owner,
    shares,
    rewardIndexCheckpoint,
    pendingRewards,
    lastCheckpointTs,
  };
}

export interface StakingState {
  /** SOL balance across the whole vault, whole tokens. */
  totalStakedSol: number;
  /** nSOL in circulation, whole tokens. */
  nsolSupply: number;
  /** SOL per nSOL — appreciating peg. Starts at 1.0. */
  exchangeRate: number;
  /** Reward rate as a yearly APY fraction (0.1 = 10%). */
  rewardApy: number;
  /** User's nSOL held as staking shares, whole tokens. */
  userShares: number;
  /** User's claimable NUT, whole tokens. */
  pendingRewards: number;
  paused: boolean;
}

export function useStakingState() {
  const { connection } = useConnection();
  const { publicKey: walletPk } = useWallet();
  const devKey = useMemo(() => loadDevKeypair(), []);
  const owner = devKey?.publicKey ?? walletPk;

  const userStakePda = useMemo(() => {
    if (!owner) return null;
    const [pda] = PublicKey.findProgramAddressSync(
      [USER_STAKE_SEED, owner.toBuffer()],
      CONFIG.stakingProgramId,
    );
    return pda;
  }, [owner]);

  return useQuery<StakingState | null>({
    queryKey: ["staking-state", owner?.toBase58() ?? null],
    refetchInterval: 5_000,
    queryFn: async () => {
      if (!CONFIG.stakingConfig) return null;
      const addrs = userStakePda
        ? [CONFIG.stakingConfig, userStakePda]
        : [CONFIG.stakingConfig];
      const infos = await connection.getMultipleAccountsInfo(addrs);
      const configInfo = infos[0];
      if (!configInfo) return null;
      const cfg = decodeConfig(configInfo.data);
      const now = BigInt(Math.floor(Date.now() / 1000));

      // Simulate the same accrual the program would do on its next ix so
      // the displayed pending rewards match what `claim_rewards` would mint.
      let currentIndex = cfg.rewardIndex;
      if (now > cfg.lastUpdateTs) {
        const elapsed = now - cfg.lastUpdateTs;
        currentIndex += (cfg.rewardRate * elapsed) / SECONDS_PER_YEAR;
      }

      // Reward APY: reward_rate is NUT-per-lamport-per-year × RATE_PRECISION.
      // APY (fraction) = reward_rate / RATE_PRECISION.
      const rewardApy = Number(cfg.rewardRate) / Number(RATE_PRECISION);

      const divisor = Number(10n ** BigInt(NSOL_DECIMALS));
      const totalStakedSol = Number(cfg.totalStakedLamports) / divisor;
      const nsolSupply = Number(cfg.nsolSupply) / divisor;
      const exchangeRate =
        nsolSupply > 0 && totalStakedSol > 0 ? totalStakedSol / nsolSupply : 1.0;

      const userInfo = userStakePda ? infos[1] : null;
      if (!userInfo) {
        return {
          totalStakedSol,
          nsolSupply,
          exchangeRate,
          rewardApy,
          userShares: 0,
          pendingRewards: 0,
          paused: cfg.paused,
        };
      }
      const us = decodeUserStake(userInfo.data);

      // Live-accrue user's rewards: earned = shares * (index - checkpoint) / RATE_PRECISION
      const delta = currentIndex - us.rewardIndexCheckpoint;
      let accrued = us.pendingRewards;
      if (delta > 0n && us.shares > 0n) {
        accrued += (us.shares * delta) / RATE_PRECISION;
      }

      return {
        totalStakedSol,
        nsolSupply,
        exchangeRate,
        rewardApy,
        userShares: Number(us.shares) / divisor,
        pendingRewards: Number(accrued) / divisor, // NUT shares same 9 decimals
        paused: cfg.paused,
      };
    },
  });
}
