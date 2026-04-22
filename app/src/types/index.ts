/**
 * Shared types.
 *
 * Kept in one file so components don't reach into `mock/` or (later)
 * `hooks/onchain/` for types — they import from `@/types`. When we
 * swap mocks for real chain data the surface area stays identical.
 */

export type AssetSymbol = "SOL" | "nSOL" | "USDC" | "NUT";

export interface UserPosition {
  /** nSOL held by this wallet (already includes interest accrual). */
  collateral: number;
  /** USDC debt. */
  debt: number;
  /** Unclaimed NUT rewards. */
  rewards: number;
  /** SOL balance in the connected wallet. */
  walletSol: number;
}

export interface PriceSnapshot {
  sol: number;
  nsol: number;
  usdc: number;
  nut: number;
}

export interface MarketStats {
  tvl: number;
  totalBorrowed: number;
  utilization: number;
  volume24h: number;
  liquidations24h: number;
}

export interface MarketRow {
  asset: AssetSymbol;
  price: number;
  supplyApy: number | null;
  borrowApr: number | null;
  utilization: number;
  tvl: number;
}

export type ActivityKind =
  | "stake"
  | "unstake"
  | "deposit"
  | "withdraw"
  | "borrow"
  | "repay"
  | "claim"
  | "liquidate";

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  amount: number;
  asset: AssetSymbol;
  tsSec: number;
  signature: string;
}

export interface LiquidationOpportunity {
  borrower: string;
  collateral: number; // nSOL
  debt: number; // USDC
  healthFactor: number; // <1.0 means liquidatable
  estimatedProfit: number; // USDC
}

export interface LiquidationRecord {
  id: string;
  borrower: string;
  liquidator: string;
  repaid: number; // USDC
  seized: number; // nSOL
  profit: number; // USDC
  tsSec: number;
}
