import { useProtocolStats } from "@/hooks/useProtocolStats";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { AnimatedNumber, Card, TokenMark } from "@/components/primitives";
import type { AssetSymbol } from "@/types";

/**
 * Markets — protocol-wide asset table.
 *
 * Rows are derived from the live `Market` account:
 *   - nSOL (collateral side): price, TVL = total collateral × price,
 *     utilization = global utilization.
 *   - USDC (debt side): debt outstanding, borrow APR.
 *
 * Supply APY for nSOL is not tracked on-chain (no interest flows to
 * suppliers — the spread goes to the treasury conceptually), so we
 * show `—`. Once a real index is wired, swap in the value.
 */

interface MarketRow {
  asset: AssetSymbol;
  price: number;
  supplyApy: number | null;
  borrowApr: number | null;
  utilization: number;
  tvl: number;
}

export default function Markets() {
  const { data: protocol, isLoading, error } = useProtocolStats();

  const rows: MarketRow[] = protocol
    ? [
        {
          asset: "nSOL",
          price: protocol.usdPerNsol,
          supplyApy: null,
          borrowApr: null,
          utilization: protocol.utilization,
          tvl: protocol.tvlUsd,
        },
        {
          asset: "USDC",
          price: 1.0,
          supplyApy: null,
          borrowApr: protocol.borrowApr,
          utilization: protocol.utilization,
          tvl: protocol.totalBorrowedUsdc,
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Markets"
        title="Assets"
        description="Live protocol data — collateral on top, debt below."
      />

      {/* Mobile: card stack */}
      <div className="md:hidden grid gap-3">
        {rows.map((m) => (
          <Card key={m.asset}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <TokenMark symbol={m.asset} size={28} />
                  <span className="font-medium">{m.asset}</span>
                </div>
                <div className="num text-sm">
                  <AnimatedNumber
                    value={m.price}
                    format={(v) =>
                      v < 1 ? `$${formatUsd(v, 4)}` : `$${formatUsd(v)}`
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <div className="eyebrow mb-1">Supply APY</div>
                  <div className="num">
                    {m.supplyApy == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="text-accent">
                        {formatPct(m.supplyApy)}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="eyebrow mb-1">Borrow APR</div>
                  <div className="num">
                    {m.borrowApr == null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      formatPct(m.borrowApr)
                    )}
                  </div>
                </div>
                <div>
                  <div className="eyebrow mb-1">Utilization</div>
                  <div className="num">{formatPct(m.utilization, 1)}</div>
                </div>
                <div>
                  <div className="eyebrow mb-1">TVL</div>
                  <div className="num">{formatCompactUsd(m.tvl)}</div>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full bg-fg/10 overflow-hidden">
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
          </Card>
        ))}
        {rows.length === 0 && (
          <Card>
            <div className="p-10 text-center text-sm text-fg-muted">
              {error
                ? `Error reading market: ${String(error)}`
                : isLoading
                ? "Loading market data…"
                : "No market data."}
            </div>
          </Card>
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block">
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
              {rows.map((m, i) => (
                <tr
                  key={m.asset}
                  className={
                    (i < rows.length - 1 ? "border-b border-border " : "") +
                    "group hover:bg-fg/[0.02] transition-colors"
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-fg-muted">
                    {error
                      ? `Error reading market: ${String(error)}`
                      : isLoading
                      ? "Loading market data…"
                      : "No market data."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
