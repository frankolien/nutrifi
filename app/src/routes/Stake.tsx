import { useMockStore } from "@/mock/data";
import { formatToken, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import {
  AnimatedNumber,
  Button,
  Card,
  Divider,
  StatCell,
  TokenBadge,
} from "@/components/primitives";
import { ManageCard } from "@/components/ManageCard";

/**
 * Stake — detail view. Action lives in the shared ManageCard (stake
 * tab pinned on mount), page adds the "advanced" stuff users who
 * navigate here specifically want: balance table, reward claim,
 * historical trend (stubbed until on-chain data lands).
 */
export default function Stake() {
  const position = useMockStore((s) => s.position);
  const prices = useMockStore((s) => s.prices);
  const claim = useMockStore((s) => s.claimRewards);

  const rewardsUsd = position.rewards * prices.nut;

  return (
    <div>
      <PageHeader
        eyebrow="Stake"
        title="Stake SOL, earn NUT"
        description="Deposit SOL to mint liquid-staked nSOL. Use nSOL as collateral on Borrow while still earning NUT rewards."
      />

      <ManageCard initialTab="stake" />

      {/* Claim + balances row */}
      <div className="max-w-action mx-auto mt-10 grid gap-4">
        <Card>
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="eyebrow mb-2">Claimable rewards</div>
              <div className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={position.rewards}
                  format={(v) => formatToken(v, 4)}
                  className="num text-2xl font-medium"
                />
                <TokenBadge symbol="NUT" />
              </div>
              <div className="num text-xs text-fg-muted mt-1">
                ≈ ${formatUsd(rewardsUsd, 4)}
              </div>
            </div>
            <Button
              variant="primary"
              onClick={claim}
              disabled={position.rewards < 0.001}
              className="h-10 px-5"
            >
              Claim
            </Button>
          </div>
        </Card>

        <Card>
          <div className="divide-y divide-border">
            <BalanceRow
              symbol="SOL"
              amount={position.walletSol}
              usd={position.walletSol * prices.sol}
            />
            <BalanceRow
              symbol="nSOL"
              amount={position.collateral}
              usd={position.collateral * prices.nsol}
            />
            <BalanceRow
              symbol="NUT"
              amount={position.rewards}
              usd={rewardsUsd}
            />
          </div>
        </Card>
      </div>

      <Divider className="mt-16" />
      <div className="max-w-readable mx-auto mt-6">
        <StatCell
          label="How it works"
          value=""
          padding="sm"
          sub={
            <span className="text-fg-muted">
              Staking SOL mints nSOL at the protocol's current exchange rate.
              nSOL appreciates as staking rewards accrue; unstaking redeems
              the appreciated amount back to SOL. NUT emissions are
              independent — you earn them per-second while holding nSOL,
              claim any time.
            </span>
          }
        />
      </div>
    </div>
  );
}

function BalanceRow({
  symbol,
  amount,
  usd,
}: {
  symbol: "SOL" | "nSOL" | "USDC" | "NUT";
  amount: number;
  usd: number;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <TokenBadge symbol={symbol} />
      </div>
      <div className="text-right">
        <div className="num text-sm font-medium">
          <AnimatedNumber value={amount} format={(v) => formatToken(v, 4)} />
        </div>
        <div className="num text-xs text-fg-muted">${formatUsd(usd, 2)}</div>
      </div>
    </div>
  );
}
