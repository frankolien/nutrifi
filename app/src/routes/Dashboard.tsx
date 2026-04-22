import { useMemo } from "react";
import { useMockStore } from "@/mock/data";
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
} from "@/components/primitives";
import { ManageCard } from "@/components/ManageCard";

/**
 * Dashboard — the action hub.
 *
 * Layout philosophy is straight out of Jupiter: the big centered card
 * *is* the page. Everything else orbits it. The position +
 * health-bar strip lives directly above the card so users see their
 * current state the moment they land, and the protocol stats sit far
 * below so they don't compete for the eye.
 *
 *   [ small position strip — net, delta, HF bar           ]
 *   [            <<<<  ManageCard  >>>>                   ]
 *   [            context cards (earned, APY)              ]
 *   [ ─────── divider ────────                            ]
 *   [            protocol stats                           ]
 */
export default function Dashboard() {
  const position = useMockStore((s) => s.position);
  const prices = useMockStore((s) => s.prices);
  const stats = useMockStore((s) => s.marketStats);

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );
  const state = healthState(health.healthFactor);

  const netUsd = health.collateralValueUsd - position.debt;

  return (
    <div>
      {/* Position strip — quiet, one line, sits above the fold's action */}
      <div className="max-w-action mx-auto mb-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="eyebrow mb-1.5">Net position</div>
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
            <div className="eyebrow mb-1.5">Health</div>
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

      {/* The action hub */}
      <ManageCard />

      {/* Context cards — personal numbers, post-action */}
      <div className="max-w-action mx-auto mt-6 grid grid-cols-2 gap-3">
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
        <Card className="hover:border-border-strong transition-colors">
          <StatCell
            label="Net APY"
            value={<span className="text-accent">+5.42%</span>}
            sub="+8.14% − 2.72%"
            padding="sm"
          />
        </Card>
        <Card className="hover:border-border-strong transition-colors">
          <StatCell
            label="NUT earned"
            value={
              <AnimatedNumber
                value={position.rewards}
                format={(v) => formatToken(v, 3)}
              />
            }
            sub={`≈ $${formatUsd(position.rewards * prices.nut, 3)}`}
            padding="sm"
          />
        </Card>
      </div>

      {/* Protocol stats — far enough down that they don't steal focus */}
      <div className="mt-20">
        <div className="eyebrow mb-4 text-center">Protocol</div>
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-border">
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
              label="24h volume"
              value={formatCompactUsd(stats.volume24h)}
              padding="sm"
            />
            <StatCell
              label="Liquidations 24h"
              value={formatCompactUsd(stats.liquidations24h)}
              padding="sm"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
