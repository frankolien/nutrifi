import { useMockStore } from "@/mock/data";
import {
  formatToken,
  formatUsd,
  relativeTime,
  shortAddress,
} from "@/lib/format";
import { PageHeader } from "@/components/layout";
import {
  AnimatedNumber,
  Button,
  Card,
  TokenMark,
} from "@/components/primitives";

/**
 * Liquidate — opportunities (top) + feed (bottom).
 *
 * Row-level liquidate buttons get the accent color because that's the
 * one place on the site where taking risk is the primary action.
 */
export default function Liquidate() {
  const opportunities = useMockStore((s) => s.opportunities);
  const liquidations = useMockStore((s) => s.liquidations);

  return (
    <div>
      <PageHeader
        eyebrow="Liquidate"
        title="Liquidation desk"
        description="Unhealthy positions can be closed by anyone holding enough USDC. The liquidator pays the borrower's debt and receives collateral at a 5% discount."
      />

      {/* Opportunities */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <span className="eyebrow">Opportunities</span>
          <span className="text-2xs text-fg-muted font-mono">
            {opportunities.length} liquidatable
          </span>
        </div>

        {opportunities.length === 0 ? (
          <Card>
            <div className="p-10 text-center text-sm text-fg-muted">
              No liquidatable positions right now. Check back shortly.
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="eyebrow text-left border-b border-border">
                    <th className="px-6 py-4 font-normal">Borrower</th>
                    <th className="px-6 py-4 font-normal text-right">
                      Collateral
                    </th>
                    <th className="px-6 py-4 font-normal text-right">Debt</th>
                    <th className="px-6 py-4 font-normal text-right">Health</th>
                    <th className="px-6 py-4 font-normal text-right">
                      Est. profit
                    </th>
                    <th className="px-6 py-4 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((op, i) => (
                    <tr
                      key={op.borrower}
                      className={
                        (i < opportunities.length - 1
                          ? "border-b border-border "
                          : "") +
                        "group hover:bg-fg/[0.02] transition-colors"
                      }
                    >
                      <td className="px-6 py-5 num text-sm">
                        {shortAddress(op.borrower, 4)}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className="num text-sm">
                          {formatToken(op.collateral, 3)}
                        </span>
                        <span className="text-fg-muted text-xs ml-1">nSOL</span>
                      </td>
                      <td className="px-6 py-5 text-right num text-sm">
                        ${formatUsd(op.debt)}
                      </td>
                      <td className="px-6 py-5 text-right num text-sm text-alert">
                        <AnimatedNumber
                          value={op.healthFactor}
                          format={(v) => `${v.toFixed(2)}×`}
                        />
                      </td>
                      <td className="px-6 py-5 text-right num text-sm text-accent">
                        +${formatUsd(op.estimatedProfit)}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button variant="primary" className="h-8 px-4 text-xs">
                          Liquidate
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Recent */}
      <section>
        <div className="eyebrow mb-4">Recent liquidations</div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="eyebrow text-left border-b border-border">
                  <th className="px-6 py-4 font-normal">When</th>
                  <th className="px-6 py-4 font-normal">Borrower</th>
                  <th className="px-6 py-4 font-normal">Liquidator</th>
                  <th className="px-6 py-4 font-normal text-right">Repaid</th>
                  <th className="px-6 py-4 font-normal text-right">Seized</th>
                  <th className="px-6 py-4 font-normal text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {liquidations.map((l, i) => (
                  <tr
                    key={l.id}
                    className={
                      (i < liquidations.length - 1
                        ? "border-b border-border "
                        : "") +
                      "group hover:bg-fg/[0.02] transition-colors"
                    }
                  >
                    <td className="px-6 py-4 text-xs text-fg-muted">
                      {relativeTime(l.tsSec)}
                    </td>
                    <td className="px-6 py-4 num text-sm">
                      {shortAddress(l.borrower, 4)}
                    </td>
                    <td className="px-6 py-4 num text-sm text-fg-muted">
                      {shortAddress(l.liquidator, 4)}
                    </td>
                    <td className="px-6 py-4 text-right num text-sm">
                      ${formatUsd(l.repaid)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-2 justify-end">
                        <span className="num text-sm">
                          {formatToken(l.seized, 3)}
                        </span>
                        <TokenMark symbol="nSOL" size={16} />
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right num text-sm text-accent">
                      +${formatUsd(l.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
