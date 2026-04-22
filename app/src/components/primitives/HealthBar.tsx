import { cx } from "@/lib/cx";
import { healthState, type Health } from "@/lib/health";

/**
 * HealthBar — the horizontal liquidation bar.
 *
 * Visual model:
 *   [————————●————————————————————————|]
 *           ^ your current utilization     ^ 100% borrow limit (= LTV cap)
 *
 * - The filled portion represents `utilization` (debt / borrow_limit).
 * - A single tick at 100% marks the LTV ceiling — further borrowing is
 *   blocked on-chain past this point.
 * - The liquidation threshold (80% collateral value, vs 75% LTV) sits
 *   *past* the 100% mark of this bar because the bar is scaled to
 *   borrow limit, not collateral. We render a second, subtler tick at
 *   `threshold/ltv = 80/75 ≈ 1.067` to show how close the liquidation
 *   wall is behind the borrow wall.
 *
 * Color rule:
 *   - healthy / caution / risk / liquidatable → the fill darkens from
 *     accent to alert. Only one color transition in the whole app.
 */

const BAR_HEIGHT_PX = 4;
const LIQ_TICK_RATIO = 8_000 / 7_500; // liquidation_threshold / ltv

interface HealthBarProps {
  health: Health;
  className?: string;
  showTicks?: boolean;
}

export function HealthBar({ health, className, showTicks = true }: HealthBarProps) {
  const state = healthState(health.healthFactor);

  // Bar is scaled to the LTV ceiling (1.0). Debt past LTV is forbidden
  // on-chain, but an oracle drop can push the rendered fill slightly
  // past the edge; clamp to 1.2 so we don't overflow visually.
  const fillRatio = Math.min(1.2, health.utilization);
  const fillWidth = `${Math.min(100, fillRatio * 100)}%`;

  const fillColor =
    state === "healthy"
      ? "bg-accent"
      : state === "caution"
      ? "bg-accent/70"
      : state === "risk"
      ? "bg-alert/70"
      : "bg-alert";

  return (
    <div className={cx("w-full", className)}>
      <div
        className="relative w-full rounded-full overflow-visible"
        style={{ height: BAR_HEIGHT_PX, background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className={cx("absolute left-0 top-0 h-full rounded-full transition-[width] duration-500", fillColor)}
          style={{ width: fillWidth }}
        />

        {showTicks && (
          <>
            {/* LTV tick at 100% */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-fg-subtle"
              style={{ left: "100%" }}
            />
            {/* Liquidation tick, scaled relative to LTV */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-alert/60"
              style={{ left: `${LIQ_TICK_RATIO * 100}%` }}
            />
          </>
        )}
      </div>

      {showTicks && (
        <div className="flex justify-between mt-2 text-2xs font-mono text-fg-subtle">
          <span>0%</span>
          <span className="text-fg-muted">Borrow limit</span>
          <span className="text-alert/70">Liquidation</span>
        </div>
      )}
    </div>
  );
}
