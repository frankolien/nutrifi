import { useMemo } from "react";
import { useMockStore } from "@/mock/data";
import { evaluateHealth, healthState } from "@/lib/health";
import { formatPct, formatToken, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import {
  AnimatedNumber,
  Divider,
  HealthBar,
  StatCell,
} from "@/components/primitives";
import { ManageCard } from "@/components/ManageCard";

/**
 * Borrow — detail view. Action lives in ManageCard (borrow tab
 * pinned); the page adds the full health-factor breakdown users
 * navigating here are looking for.
 *
 * Layout: summary strip + bar above the card, collateral actions
 * below (deposit/withdraw live here specifically — the ManageCard on
 * dashboard keeps it to Borrow/Repay because those are the common
 * cases; managing collateral is the "advanced" move that earned its
 * way onto its own route).
 */
export default function Borrow() {
  const position = useMockStore((s) => s.position);
  const prices = useMockStore((s) => s.prices);
  const depositFn = useMockStore((s) => s.deposit);
  const withdrawFn = useMockStore((s) => s.withdraw);

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );
  const state = healthState(health.healthFactor);

  return (
    <div>
      <PageHeader
        eyebrow="Borrow"
        title="Collateral & debt"
        description="Deposit nSOL, borrow USDC. Keep your health factor above 1.0× or a liquidator can close your position."
      />

      {/* Position summary strip */}
      <div className="max-w-action mx-auto mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="eyebrow mb-1.5">Collateral</div>
            <div className="flex items-baseline gap-2">
              <AnimatedNumber
                value={health.collateralValueUsd}
                format={(v) => formatUsd(v)}
                className="num text-2xl font-medium"
              />
              <span className="text-fg-muted text-xs">$</span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow mb-1.5">Debt</div>
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-fg-muted text-xs">$</span>
              <AnimatedNumber
                value={position.debt}
                format={(v) => formatUsd(v)}
                className="num text-2xl font-medium"
              />
            </div>
          </div>
        </div>

        <HealthBar health={health} />

        <div className="flex items-center justify-between mt-4 text-xs">
          <span className="text-fg-muted">
            Health{" "}
            <span
              className={`num ${
                state === "healthy" || state === "caution"
                  ? "text-fg"
                  : "text-alert"
              }`}
            >
              {Number.isFinite(health.healthFactor)
                ? `${health.healthFactor.toFixed(2)}×`
                : "∞"}
            </span>
          </span>
          <span className="text-fg-muted">
            Liq price{" "}
            <span className="num text-fg">
              ${formatUsd(health.liquidationPriceUsd)}
            </span>
          </span>
        </div>
      </div>

      {/* Primary action: borrow/repay */}
      <ManageCard initialTab="borrow" />

      {/* Collateral management — advanced, sits below */}
      <div className="max-w-action mx-auto mt-10">
        <div className="eyebrow mb-3 text-center">Collateral</div>
        <div className="grid grid-cols-2 gap-3">
          <CollateralActionCard
            label="Deposit nSOL"
            description="Strengthens your health factor."
            cta="Deposit"
            onClick={() => depositFn(1)}
          />
          <CollateralActionCard
            label="Withdraw nSOL"
            description="Weakens your health factor."
            cta="Withdraw"
            onClick={() => withdrawFn(1)}
            danger
          />
        </div>
      </div>

      <Divider className="mt-16" />
      <div className="max-w-readable mx-auto mt-6 grid md:grid-cols-3 gap-4">
        <StatCell
          label="LTV"
          value={formatPct(0.75, 0)}
          sub="Max borrow"
          padding="sm"
        />
        <StatCell
          label="Liquidation"
          value={formatPct(0.8, 0)}
          sub="Threshold"
          padding="sm"
        />
        <StatCell
          label="Bonus"
          value={formatPct(0.05, 0)}
          sub="Paid to liquidators"
          padding="sm"
        />
      </div>
    </div>
  );
}

function CollateralActionCard({
  label,
  description,
  cta,
  onClick,
  danger,
}: {
  label: string;
  description: string;
  cta: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-md border border-border bg-fg/[0.02] px-4 py-4 transition-all hover:border-border-strong hover:bg-fg/[0.04]"
    >
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="text-xs text-fg-muted mb-3">{description}</div>
      <div
        className={`text-xs font-medium ${
          danger ? "text-alert/80 group-hover:text-alert" : "text-accent/80 group-hover:text-accent"
        } transition-colors`}
      >
        {cta} →
      </div>
    </button>
  );
}

