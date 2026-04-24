import { useState } from "react";
import { useLiquidationOpportunities, Opportunity } from "@/hooks/useLiquidationOpportunities";
import { useSendTx, useActiveSigner } from "@/hooks/useSendTx";
import { buildLiquidateIx } from "@/lib/chain/ix";
import { humanizeError } from "@/lib/chain/errors";
import { CONFIG, USDC_DECIMALS } from "@/lib/config";
import { formatToken, formatUsd, shortAddress } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { AnimatedNumber, Button, Card } from "@/components/primitives";

/**
 * Liquidate — real opportunities pulled via `getProgramAccounts`.
 *
 * Each row represents a loan whose health factor has dropped below 1×.
 * Clicking Liquidate sends a `liquidate` ix that repays up to the
 * close-factor cap (50%) and seizes collateral at the 5% bonus.
 *
 * You can only liquidate if you hold enough USDC in your wallet. We
 * don't enforce that client-side — the chain reverts if you don't.
 */
export default function Liquidate() {
  const { data: opportunities = [], isLoading, refetch } = useLiquidationOpportunities();

  return (
    <div>
      <PageHeader
        eyebrow="Liquidate"
        title="Liquidation desk"
        description="Unhealthy positions can be closed by anyone holding enough USDC. The liquidator pays the borrower's debt and receives collateral at a 5% discount."
      />

      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <span className="eyebrow">Opportunities</span>
          <span className="text-2xs text-fg-muted font-mono">
            {isLoading ? "scanning…" : `${opportunities.length} liquidatable`}
          </span>
        </div>

        {isLoading && opportunities.length === 0 ? (
          <Card>
            <div className="p-10 text-center text-sm text-fg-muted">
              Scanning UserLoan accounts…
            </div>
          </Card>
        ) : opportunities.length === 0 ? (
          <Card>
            <div className="p-10 text-center text-sm text-fg-muted">
              No liquidatable positions right now.
              <br />
              <span className="text-xs text-fg-subtle">
                Auto-refreshes every 10s.
              </span>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile: card stack */}
            <div className="md:hidden grid gap-3">
              {opportunities.map((op) => (
                <MobileOpportunityCard
                  key={op.userLoanPda.toBase58()}
                  op={op}
                  onAfter={() => refetch()}
                />
              ))}
            </div>

            {/* Desktop: table */}
            <Card className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="eyebrow text-left border-b border-border">
                      <th className="px-6 py-4 font-normal">Borrower</th>
                      <th className="px-6 py-4 font-normal text-right">
                        Collateral
                      </th>
                      <th className="px-6 py-4 font-normal text-right">
                        Debt
                      </th>
                      <th className="px-6 py-4 font-normal text-right">
                        Health
                      </th>
                      <th className="px-6 py-4 font-normal text-right">
                        Max repay
                      </th>
                      <th className="px-6 py-4 font-normal text-right">
                        Est. profit
                      </th>
                      <th className="px-6 py-4 font-normal" />
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((op, i) => (
                      <OpportunityRow
                        key={op.userLoanPda.toBase58()}
                        op={op}
                        isLast={i === opportunities.length - 1}
                        onAfter={() => refetch()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </section>

      <section>
        <div className="eyebrow mb-4">Recent liquidations</div>
        <Card>
          <div className="p-8 text-center text-sm text-fg-muted">
            Historical liquidation feed requires an off-chain indexer.
            <br />
            <span className="text-xs text-fg-subtle">
              Check the bot logs in `services/` for a real feed.
            </span>
          </div>
        </Card>
      </section>
    </div>
  );
}

function useLiquidate(op: Opportunity, onAfter: () => void) {
  const sendTx = useSendTx();
  const { publicKey } = useActiveSigner();
  const [err, setErr] = useState<string | null>(null);

  const onLiquidate = async () => {
    if (!publicKey) return;
    setErr(null);
    try {
      const repayLamports = BigInt(
        Math.floor(op.maxRepayUsdc * 10 ** USDC_DECIMALS),
      );
      await sendTx.mutateAsync({
        instructions: [
          buildLiquidateIx(
            publicKey,
            op.borrower,
            op.userLoanPda,
            repayLamports,
          ),
        ],
        ensureAtasFor: [CONFIG.debtMint, CONFIG.collateralMint],
      });
      onAfter();
    } catch (e) {
      setErr(humanizeError(e));
    }
  };

  return { onLiquidate, isPending: sendTx.isPending, err };
}

function MobileOpportunityCard({
  op,
  onAfter,
}: {
  op: Opportunity;
  onAfter: () => void;
}) {
  const { onLiquidate, isPending, err } = useLiquidate(op, onAfter);
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="num text-sm">
            {shortAddress(op.borrower.toBase58(), 4)}
          </span>
          <span className="num text-sm text-alert">
            <AnimatedNumber
              value={op.healthFactor}
              format={(v) => `${v.toFixed(2)}×`}
            />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
          <div>
            <div className="eyebrow mb-0.5">Collateral</div>
            <div className="num">
              {formatToken(op.collateralNsol, 3)}{" "}
              <span className="text-fg-muted">nSOL</span>
            </div>
          </div>
          <div>
            <div className="eyebrow mb-0.5">Debt</div>
            <div className="num">${formatUsd(op.debtUsdc)}</div>
          </div>
          <div>
            <div className="eyebrow mb-0.5">Max repay</div>
            <div className="num">${formatUsd(op.maxRepayUsdc)}</div>
          </div>
          <div>
            <div className="eyebrow mb-0.5">Est. profit</div>
            <div className="num text-accent">
              +${formatUsd(op.estimatedProfitUsd)}
            </div>
          </div>
        </div>
        <Button
          variant="primary"
          className="w-full h-10 text-sm"
          onClick={onLiquidate}
          disabled={isPending}
        >
          {isPending ? "…" : "Liquidate"}
        </Button>
        {err && (
          <div className="mt-2 text-xs text-alert text-center">{err}</div>
        )}
      </div>
    </Card>
  );
}

function OpportunityRow({
  op,
  isLast,
  onAfter,
}: {
  op: Opportunity;
  isLast: boolean;
  onAfter: () => void;
}) {
  const sendTx = useSendTx();
  const { publicKey } = useActiveSigner();
  const [err, setErr] = useState<string | null>(null);

  const onLiquidate = async () => {
    if (!publicKey) return;
    setErr(null);
    try {
      const repayLamports = BigInt(
        Math.floor(op.maxRepayUsdc * 10 ** USDC_DECIMALS),
      );
      await sendTx.mutateAsync({
        instructions: [
          buildLiquidateIx(
            publicKey,
            op.borrower,
            op.userLoanPda,
            repayLamports,
          ),
        ],
        ensureAtasFor: [CONFIG.debtMint, CONFIG.collateralMint],
      });
      onAfter();
    } catch (e) {
      setErr(humanizeError(e));
    }
  };

  return (
    <>
      <tr
        className={
          (isLast ? "" : "border-b border-border ") +
          "group hover:bg-fg/[0.02] transition-colors"
        }
      >
        <td className="px-6 py-5 num text-sm">
          {shortAddress(op.borrower.toBase58(), 4)}
        </td>
        <td className="px-6 py-5 text-right">
          <span className="num text-sm">{formatToken(op.collateralNsol, 3)}</span>
          <span className="text-fg-muted text-xs ml-1">nSOL</span>
        </td>
        <td className="px-6 py-5 text-right num text-sm">
          ${formatUsd(op.debtUsdc)}
        </td>
        <td className="px-6 py-5 text-right num text-sm text-alert">
          <AnimatedNumber
            value={op.healthFactor}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </td>
        <td className="px-6 py-5 text-right num text-sm">
          ${formatUsd(op.maxRepayUsdc)}
        </td>
        <td className="px-6 py-5 text-right num text-sm text-accent">
          +${formatUsd(op.estimatedProfitUsd)}
        </td>
        <td className="px-6 py-5 text-right">
          <Button
            variant="primary"
            className="h-8 px-4 text-xs"
            onClick={onLiquidate}
            disabled={sendTx.isPending}
          >
            {sendTx.isPending ? "…" : "Liquidate"}
          </Button>
        </td>
      </tr>
      {err && (
        <tr>
          <td colSpan={7} className="px-6 pb-4 text-xs text-alert text-center">
            {err}
          </td>
        </tr>
      )}
    </>
  );
}
