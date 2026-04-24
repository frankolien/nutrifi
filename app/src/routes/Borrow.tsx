import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useMockStore } from "@/mock/data";
import { evaluateHealth, healthState } from "@/lib/health";
import { formatPct, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import {
  AnimatedNumber,
  Divider,
  HealthBar,
  StatCell,
  Tooltip,
} from "@/components/primitives";
import { ManageCard } from "@/components/ManageCard";

/**
 * Borrow — detail view. All four collateral/debt actions live inside
 * the ManageCard below (deposit / borrow / repay / withdraw). This page
 * frames the user's current position with the full health breakdown
 * they came here for.
 */
export default function Borrow() {
  const { connected } = useWallet();
  const { data: live } = useUserPosition();
  const { data: protocol } = useProtocolStats();
  const mockPosition = useMockStore((s) => s.position);
  const mockPrices = useMockStore((s) => s.prices);

  const position = connected && live ? live.position : mockPosition;
  const prices = connected && live ? live.prices : mockPrices;

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );
  const state = healthState(health.healthFactor);

  const ltv = protocol ? protocol.loanToValue : 0.75;
  const liqThreshold = protocol ? protocol.liquidationThreshold : 0.8;
  const liqBonus = protocol
    ? Number(protocol.market.liquidationBonusBps) / 10_000
    : 0.05;

  return (
    <div>
      <PageHeader
        eyebrow="Borrow"
        title="Collateral & debt"
        description="Deposit nSOL, borrow USDC. Keep your health factor above 1.0× or a liquidator can close your position."
      />

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

      {/* All four actions live inside ManageCard's borrow tab. */}
      <ManageCard initialTab="borrow" />

      <Divider className="mt-16" />
      <div className="max-w-readable mx-auto mt-6 grid md:grid-cols-3 gap-4">
        <StatCell
          label={
            <Tooltip text="Loan-to-value cap: the most you can borrow as a fraction of your collateral's USD value.">
              LTV
            </Tooltip>
          }
          value={formatPct(ltv, 0)}
          sub="Max borrow"
          padding="sm"
        />
        <StatCell
          label={
            <Tooltip text="Liquidation threshold. If debt / collateral-value crosses this ratio, a liquidator can close part of your position.">
              Liquidation
            </Tooltip>
          }
          value={formatPct(liqThreshold, 0)}
          sub="Threshold"
          padding="sm"
        />
        <StatCell
          label={
            <Tooltip text="Discount the liquidator receives on seized collateral. Incentive to keep the protocol solvent.">
              Bonus
            </Tooltip>
          }
          value={formatPct(liqBonus, 0)}
          sub="Paid to liquidators"
          padding="sm"
        />
      </div>
    </div>
  );
}
