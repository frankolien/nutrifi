import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMockStore } from "@/mock/data";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { evaluateHealth, healthState } from "@/lib/health";
import {
  formatCompactUsd,
  formatPct,
  formatToken,
  formatUsd,
} from "@/lib/format";
import {
  AnimatedNumber,
  Card,
  HealthBar,
  StatCell,
  Tooltip,
} from "@/components/primitives";
import { ManageCard } from "@/components/ManageCard";
import { Sidebar } from "@/components/Sidebar";

/**
 * Dashboard — two-column layout on wide viewports.
 *
 *   ┌──────────── max-w-5xl ────────────┐
 *   │                                   │
 *   │  [position + action] │ [sidebar]  │
 *   │  [context cards]     │            │
 *   │                                   │
 *   │  [protocol stats footer]          │
 *   └───────────────────────────────────┘
 *
 * On narrow viewports the sidebar stacks below the action column.
 */
export default function Dashboard() {
  const { connected } = useWallet();
  const { data: live, isLoading: liveLoading } = useUserPosition();
  const { data: protocol } = useProtocolStats();

  const mockPosition = useMockStore((s) => s.position);
  const mockPrices = useMockStore((s) => s.prices);
  const mockStats = useMockStore((s) => s.marketStats);

  const stats = protocol
    ? {
        tvl: protocol.tvlUsd,
        totalBorrowed: protocol.totalBorrowedUsdc,
        utilization: protocol.utilization,
        volume24h: mockStats.volume24h,
        liquidations24h: mockStats.liquidations24h,
      }
    : mockStats;

  const position = connected && live ? live.position : mockPosition;
  const prices = connected && live ? live.prices : mockPrices;
  const isLive = connected && !!live;

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );
  const state = healthState(health.healthFactor);

  const netUsd = health.collateralValueUsd - position.debt;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
        {/* Main column */}
        <div className="min-w-0">
          {/* Position strip */}
          <div className="mb-6">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="eyebrow mb-1.5 flex items-center gap-2">
                  Net position
                  {isLive && (
                    <span className="text-[9px] uppercase tracking-[0.12em] text-accent">
                      live
                    </span>
                  )}
                  {connected && liveLoading && (
                    <span className="text-[9px] uppercase tracking-[0.12em] text-fg-muted">
                      loading
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-fg-subtle text-lg">$</span>
                  <AnimatedNumber
                    value={netUsd}
                    format={(v) => formatUsd(v)}
                    className="num text-4xl font-semibold tracking-tight"
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="eyebrow mb-1.5 flex items-center justify-end">
                  <Tooltip text="Health factor = (collateral value × 80%) / debt. Below 1× anyone can liquidate you at a 5% discount. Stay above 1.3× for breathing room.">
                    Health
                  </Tooltip>
                </div>
                <div className="flex items-baseline gap-2 justify-end">
                  <AnimatedNumber
                    value={
                      Number.isFinite(health.healthFactor)
                        ? health.healthFactor
                        : 99
                    }
                    format={(v) => (v >= 99 ? "∞" : `${v.toFixed(2)}×`)}
                    className={`num text-2xl font-medium ${
                      state === "healthy" || state === "caution"
                        ? "text-fg"
                        : "text-alert"
                    }`}
                  />
                  <span
                    className={`text-2xs uppercase tracking-[0.12em] ${
                      state === "healthy"
                        ? "text-accent"
                        : state === "caution"
                        ? "text-fg-muted"
                        : "text-alert"
                    }`}
                  >
                    {state === "healthy"
                      ? "Healthy"
                      : state === "caution"
                      ? "Caution"
                      : state === "risk"
                      ? "At risk"
                      : "Liquidatable"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <HealthBar health={health} showTicks={false} />
            </div>
          </div>

          <ManageCard />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Card className="hover:border-border-strong transition-colors">
              <StatCell
                label="Supplied"
                value={
                  <AnimatedNumber
                    value={position.collateral}
                    format={(v) => formatToken(v, 3)}
                  />
                }
                sub={`nSOL · $${formatUsd(health.collateralValueUsd)}`}
                padding="sm"
              />
            </Card>
            <Card className="hover:border-border-strong transition-colors">
              <StatCell
                label="Borrowed"
                value={
                  <AnimatedNumber
                    value={position.debt}
                    format={(v) => `$${formatUsd(v)}`}
                  />
                }
                sub={`USDC · ${formatPct(health.utilization, 1)} of limit`}
                padding="sm"
              />
            </Card>
          </div>
        </div>

        {/* Right sidebar — stacks below on narrow viewports */}
        <div>
          <Sidebar />
        </div>
      </div>

      {/* Protocol stats footer (full width, compact) */}
      <div className="mt-16">
        <div className="eyebrow mb-3">Protocol</div>
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
            <StatCell
              label="TVL"
              value={formatCompactUsd(stats.tvl)}
              padding="sm"
            />
            <StatCell
              label="Total borrowed"
              value={formatCompactUsd(stats.totalBorrowed)}
              padding="sm"
            />
            <StatCell
              label="Utilization"
              value={formatPct(stats.utilization, 1)}
              padding="sm"
            />
            <StatCell
              label="Borrow APR"
              value={protocol ? formatPct(protocol.borrowApr, 2) : "—"}
              padding="sm"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
