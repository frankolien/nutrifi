import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMockStore } from "@/mock/data";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useStakingState } from "@/hooks/useStakingState";
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
 *   ┌──────────── max-w-5xl ────────────────────────────┐
 *   │  [4 KPI cards — net · health · earnings · price]  │
 *   │                                                   │
 *   │  [position + action]     │  [sidebar]             │
 *   │  [supplied / borrowed]   │                        │
 *   │                                                   │
 *   │  Protocol at a glance                             │
 *   │  [tvl · borrowed · utilization · APR]             │
 *   └───────────────────────────────────────────────────┘
 */
export default function Dashboard() {
  const { connected } = useWallet();
  const { data: live, isLoading: liveLoading } = useUserPosition();
  const { data: protocol } = useProtocolStats();
  const { data: staking } = useStakingState();

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

  // Projected yearly earnings in USD:
  //   staking APY on user's nSOL share of pool, minus borrow APR on debt.
  // This is the "net yield" the user is running right now — negative for
  // users who are purely borrowing, positive for leveraged stakers.
  const stakeApy = staking?.rewardApy ?? 0;
  const borrowApr = protocol?.borrowApr ?? 0;
  const stakeEarningsUsd = position.collateral * prices.nsol * stakeApy;
  const borrowCostUsd = position.debt * borrowApr;
  const projectedYearlyUsd = stakeEarningsUsd - borrowCostUsd;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Four-up KPI row — stacks as 2x2 on mobile, 4x1 on desktop. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              Net position
              {isLive && <LiveDot />}
              {connected && liveLoading && (
                <span className="text-[9px] uppercase tracking-[0.12em] text-fg-muted">
                  loading
                </span>
              )}
            </span>
          }
          value={
            <AnimatedNumber
              value={netUsd}
              format={(v) => `$${formatUsd(v)}`}
            />
          }
          sub={`Collateral − debt`}
        />
        <KpiCard
          label={
            <Tooltip text="Health factor = (collateral value × 80%) / debt. Below 1× anyone can liquidate you at a 5% discount. Stay above 1.3× for breathing room.">
              Health
            </Tooltip>
          }
          value={
            <AnimatedNumber
              value={
                Number.isFinite(health.healthFactor) ? health.healthFactor : 99
              }
              format={(v) => (v >= 99 ? "∞" : `${v.toFixed(2)}×`)}
              className={
                state === "healthy" || state === "caution"
                  ? "text-fg"
                  : "text-alert"
              }
            />
          }
          sub={
            <span
              className={
                state === "healthy"
                  ? "text-accent"
                  : state === "caution"
                  ? "text-fg-muted"
                  : "text-alert"
              }
            >
              {state === "healthy"
                ? "Healthy"
                : state === "caution"
                ? "Caution"
                : state === "risk"
                ? "At risk"
                : "Liquidatable"}
            </span>
          }
        />
        <KpiCard
          label={
            <Tooltip text="Annualized: staking APY on your supplied nSOL, minus borrow APR on your debt. Based on current rates.">
              Projected / yr
            </Tooltip>
          }
          value={
            <AnimatedNumber
              value={projectedYearlyUsd}
              format={(v) =>
                `${v >= 0 ? "+" : "−"}$${formatUsd(Math.abs(v))}`
              }
              className={
                projectedYearlyUsd >= 0 ? "text-accent" : "text-alert"
              }
            />
          }
          sub={
            <span className="num">
              {formatPct(stakeApy, 2)} stake · −{formatPct(borrowApr, 2)} borrow
            </span>
          }
        />
        <KpiCard
          label={<span>nSOL price</span>}
          value={
            <AnimatedNumber
              value={prices.nsol}
              format={(v) => `$${formatUsd(v, 2)}`}
            />
          }
          sub={
            protocol ? (
              <span className="num">
                liq. at ${formatUsd(health.liquidationPriceUsd, 2)}
              </span>
            ) : (
              <span className="num">oracle feed</span>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
        {/* Main column */}
        <div className="min-w-0">
          {/* Health bar (KPIs have replaced the position strip) */}
          <div className="mb-6">
            <HealthBar health={health} showTicks={false} />
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

      {/* Protocol at a glance */}
      <div className="mt-10 sm:mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
              Protocol at a glance
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Live reads from the on-chain Market account.
            </p>
          </div>
          {isLive && (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-accent">
              <LiveDot /> Live
            </span>
          )}
        </div>
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

function KpiCard({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="hover:border-border-strong transition-colors">
      <div className="p-3 sm:p-4">
        <div className="eyebrow mb-2 sm:mb-3 min-h-[14px] truncate">
          {label}
        </div>
        <div className="num text-xl sm:text-2xl font-medium leading-none tabular-nums truncate">
          {value}
        </div>
        {sub && (
          <div className="num text-[11px] sm:text-xs text-fg-muted mt-1.5 sm:mt-2 min-h-[14px] truncate">
            {sub}
          </div>
        )}
      </div>
    </Card>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex items-center">
      <span className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-accent opacity-75 animate-ping" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}
