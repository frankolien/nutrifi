/**
 * Mock data + the Zustand store that exposes it to the UI.
 *
 * Every on-chain read lives behind a `useMockStore` selector. When we
 * wire the Anchor client in step 11, we swap this file's internals
 * for real queries — components stay identical because they read via
 * the same selector names.
 */

import { create } from "zustand";
import type {
  ActivityRow,
  LiquidationOpportunity,
  LiquidationRecord,
  MarketRow,
  MarketStats,
  PriceSnapshot,
  UserPosition,
} from "@/types";

export interface MockState {
  connected: boolean;
  walletAddress: string;

  position: UserPosition;
  prices: PriceSnapshot;
  marketStats: MarketStats;
  markets: MarketRow[];
  activity: ActivityRow[];
  liquidations: LiquidationRecord[];
  opportunities: LiquidationOpportunity[];

  // Actions — these mutate local state; real versions will send txs.
  connect: () => void;
  disconnect: () => void;
  stake: (amountSol: number) => void;
  unstake: (amountNsol: number) => void;
  deposit: (amountNsol: number) => void;
  withdraw: (amountNsol: number) => void;
  borrow: (amountUsdc: number) => void;
  repay: (amountUsdc: number) => void;
  claimRewards: () => void;
}

const NOW = Math.floor(Date.now() / 1000);

const initialMarkets: MarketRow[] = [
  {
    asset: "SOL",
    price: 142.37,
    supplyApy: 0.0814,
    borrowApr: 0.0921,
    utilization: 0.684,
    tvl: 24_500_000,
  },
  {
    asset: "nSOL",
    price: 142.85,
    supplyApy: null,
    borrowApr: 0.0672,
    utilization: 0.541,
    tvl: 18_200_000,
  },
  {
    asset: "USDC",
    price: 1.0001,
    supplyApy: 0.0412,
    borrowApr: 0.0672,
    utilization: 0.812,
    tvl: 4_100_000,
  },
  {
    asset: "NUT",
    price: 0.0824,
    supplyApy: 0.184,
    borrowApr: null,
    utilization: 0.124,
    tvl: 420_000,
  },
];

const initialActivity: ActivityRow[] = [
  { id: "1", kind: "stake", amount: 5, asset: "SOL", tsSec: NOW - 3_600, signature: "5Kq7...2Fvt" },
  { id: "2", kind: "deposit", amount: 5.0170, asset: "nSOL", tsSec: NOW - 3_540, signature: "3Jpx...LmN1" },
  { id: "3", kind: "borrow", amount: 400, asset: "USDC", tsSec: NOW - 3_200, signature: "Hm2p...9Kdq" },
  { id: "4", kind: "claim", amount: 2.14, asset: "NUT", tsSec: NOW - 86_400, signature: "Yb1k...dP9r" },
  { id: "5", kind: "borrow", amount: 400, asset: "USDC", tsSec: NOW - 172_800, signature: "7xKq...aB3f" },
];

const initialLiquidations: LiquidationRecord[] = [
  { id: "a", borrower: "7xKq8zQ4JpAa3qXrPbdvWKv3yLmaB3f", liquidator: "Hm2p9Kdq", repaid: 1240.5, seized: 9.1, profit: 42.1, tsSec: NOW - 720 },
  { id: "b", borrower: "3JpxLmN1yX2KvTpQ5rE8sW4qAbcDefG", liquidator: "Yb1kdP9r", repaid: 5240.8, seized: 38.7, profit: 178.9, tsSec: NOW - 1_700 },
  { id: "c", borrower: "Qr7s2FvtZmN1pK3jXqPbdvWKvaBcDe4", liquidator: "3JpxLmN1", repaid: 320.0, seized: 2.4, profit: 10.8, tsSec: NOW - 6_800 },
];

const initialOpportunities: LiquidationOpportunity[] = [
  { borrower: "7xKq8zQ4JpAa3qXrPbdvWKv3yLm", collateral: 12.4, debt: 1_680, healthFactor: 0.94, estimatedProfit: 58.2 },
  { borrower: "Qr7s2FvtZmN1pK3jXqPbdvWKva", collateral: 3.1, debt: 420, healthFactor: 0.97, estimatedProfit: 12.4 },
];

export const useMockStore = create<MockState>((set) => ({
  connected: false,
  walletAddress: "7xKq8zQ4JpAa3qXrPbdvWKv3yLmaB3f",

  position: {
    collateral: 10.0342,
    debt: 800,
    rewards: 12.47,
    walletSol: 18.24,
  },
  prices: { sol: 142.37, nsol: 142.85, usdc: 1.0001, nut: 0.0824 },
  marketStats: {
    tvl: 47_200_000,
    totalBorrowed: 14_100_000,
    utilization: 0.684,
    volume24h: 2_400_000,
    liquidations24h: 128_000,
  },
  markets: initialMarkets,
  activity: initialActivity,
  liquidations: initialLiquidations,
  opportunities: initialOpportunities,

  connect: () => set({ connected: true }),
  disconnect: () => set({ connected: false }),

  stake: (amountSol) =>
    set((s) => {
      const nsol = amountSol / 0.9966; // Mirror the on-chain nSOL peg.
      return {
        position: {
          ...s.position,
          walletSol: s.position.walletSol - amountSol,
          collateral: s.position.collateral + nsol,
        },
        activity: [
          {
            id: String(Date.now()),
            kind: "stake",
            amount: amountSol,
            asset: "SOL",
            tsSec: Math.floor(Date.now() / 1000),
            signature: "mock…sig",
          },
          ...s.activity,
        ],
      };
    }),

  unstake: (amountNsol) =>
    set((s) => {
      const sol = amountNsol * 0.9966;
      return {
        position: {
          ...s.position,
          collateral: Math.max(0, s.position.collateral - amountNsol),
          walletSol: s.position.walletSol + sol,
        },
        activity: [
          {
            id: String(Date.now()),
            kind: "unstake",
            amount: amountNsol,
            asset: "nSOL",
            tsSec: Math.floor(Date.now() / 1000),
            signature: "mock…sig",
          },
          ...s.activity,
        ],
      };
    }),

  deposit: (amountNsol) =>
    set((s) => ({
      position: {
        ...s.position,
        collateral: s.position.collateral + amountNsol,
      },
      activity: [
        {
          id: String(Date.now()),
          kind: "deposit",
          amount: amountNsol,
          asset: "nSOL",
          tsSec: Math.floor(Date.now() / 1000),
          signature: "mock…sig",
        },
        ...s.activity,
      ],
    })),

  withdraw: (amountNsol) =>
    set((s) => ({
      position: {
        ...s.position,
        collateral: Math.max(0, s.position.collateral - amountNsol),
      },
      activity: [
        {
          id: String(Date.now()),
          kind: "withdraw",
          amount: amountNsol,
          asset: "nSOL",
          tsSec: Math.floor(Date.now() / 1000),
          signature: "mock…sig",
        },
        ...s.activity,
      ],
    })),

  borrow: (amountUsdc) =>
    set((s) => ({
      position: { ...s.position, debt: s.position.debt + amountUsdc },
      activity: [
        {
          id: String(Date.now()),
          kind: "borrow",
          amount: amountUsdc,
          asset: "USDC",
          tsSec: Math.floor(Date.now() / 1000),
          signature: "mock…sig",
        },
        ...s.activity,
      ],
    })),

  repay: (amountUsdc) =>
    set((s) => ({
      position: {
        ...s.position,
        debt: Math.max(0, s.position.debt - amountUsdc),
      },
      activity: [
        {
          id: String(Date.now()),
          kind: "repay",
          amount: amountUsdc,
          asset: "USDC",
          tsSec: Math.floor(Date.now() / 1000),
          signature: "mock…sig",
        },
        ...s.activity,
      ],
    })),

  claimRewards: () =>
    set((s) => ({
      position: { ...s.position, rewards: 0 },
      activity: [
        {
          id: String(Date.now()),
          kind: "claim",
          amount: s.position.rewards,
          asset: "NUT",
          tsSec: Math.floor(Date.now() / 1000),
          signature: "mock…sig",
        },
        ...s.activity,
      ],
    })),
}));
