import { useMockStore } from "@/mock/data";
import {
  formatCompactUsd,
  formatPct,
  formatUsd,
} from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { AnimatedNumber, Card, TokenMark } from "@/components/primitives";

/**
 * Markets — protocol-wide asset table.
 *
 * Row hover state and the utilization bar gradient lift this out of
 * the "Wikipedia table" feel. Numbers animate on change so live price
 * updates don't look like text swaps.
 */
export default function Markets() {
  const markets = useMockStore((s) => s.markets);

  return (
    <div>
      <PageHeader
        eyebrow="Markets"
        title="Assets"
        description="Every asset supported by the protocol, with current rates and utilization."
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="eyebrow text-left border-b border-border">
                <th className="px-6 py-4 font-normal">Asset</th>
                <th className="px-6 py-4 font-normal text-right">Price</th>
                <th className="px-6 py-4 font-normal text-right">Supply APY</th>
                <th className="px-6 py-4 font-normal text-right">Borrow APR</th>
                <th className="px-6 py-4 font-normal w-64">Utilization</th>
                <th className="px-6 py-4 font-normal text-right">TVL</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m, i) => (
                <tr
                  key={m.asset}
                  className={
                    (i < markets.length - 1 ? "border-b border-border " : "") +
                    "group hover:bg-fg/[0.02] transition-colors cursor-pointer"
                  }
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <TokenMark symbol={m.asset} size={30} />
                      <span className="font-medium">{m.asset}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right num text-sm">
                    <AnimatedNumber
                      value={m.price}
                      format={(v) =>
                        v < 1 ? `$${formatUsd(v, 4)}` : `$${formatUsd(v)}`
                      }
                    />
                  </td>
                  <td className="px-6 py-5 text-right num text-sm">
                    {m.supplyApy == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="text-accent">{formatPct(m.supplyApy)}</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right num text-sm">
                    {m.borrowApr == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      formatPct(m.borrowApr)
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <span className="num text-sm w-12 text-right text-fg-muted">
                        {formatPct(m.utilization, 1)}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-fg/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${m.utilization * 100}%`,
                            background:
                              "linear-gradient(90deg, rgba(250,250,250,0.25), rgba(107,191,138,0.8))",
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right num text-sm">
                    {formatCompactUsd(m.tvl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
