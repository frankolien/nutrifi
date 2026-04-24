import { useWallet } from "@solana/wallet-adapter-react";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useMockStore } from "@/mock/data";
import { formatToken, formatUsd } from "@/lib/format";
import { NSOL_DECIMALS, USDC_DECIMALS } from "@/lib/config";
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
 * Stake — detail view.
 *
 * The in-card Stake action is disabled until the staking program is
 * initialized on-chain (see ManageCard StakePanel). Until then this
 * page is a read-only preview: the user's wallet balances are live,
 * everything else stays informational.
 */
export default function Stake() {
  const { connected } = useWallet();
  const { data: live } = useUserPosition();
  const mockPosition = useMockStore((s) => s.position);
  const mockPrices = useMockStore((s) => s.prices);

  const position = connected && live ? live.position : mockPosition;
  const prices = connected && live ? live.prices : mockPrices;

  // Wallet balances: live when connected, zeros when not.
  const walletSol = position.walletSol;
  const walletNsol = live
    ? Number(live.walletBalances.nsolLamports) / 10 ** NSOL_DECIMALS
    : 0;
  const walletUsdc = live
    ? Number(live.walletBalances.usdcLamports) / 10 ** USDC_DECIMALS
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Stake"
        title="Stake SOL, earn NUT"
        description="Deposit SOL to mint liquid-staked nSOL. Use nSOL as collateral on Borrow while still earning NUT rewards."
      />

      <ManageCard initialTab="stake" />

      <div className="max-w-action mx-auto mt-10 grid gap-4">
        <Card>
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="eyebrow mb-2">Claimable rewards</div>
              <div className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={0}
                  format={(v) => formatToken(v, 4)}
                  className="num text-2xl font-medium"
                />
                <TokenBadge symbol="NUT" />
              </div>
              <div className="num text-xs text-fg-muted mt-1">
                Available once staking is initialized.
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => {}}
              disabled
              className="h-10 px-5"
            >
              Claim
            </Button>
          </div>
        </Card>

        <Card>
          <div className="divide-y divide-border">
            <BalanceRow symbol="SOL" amount={walletSol} usd={walletSol * prices.sol} />
            <BalanceRow
              symbol="nSOL"
              amount={walletNsol}
              usd={walletNsol * prices.nsol}
            />
            <BalanceRow symbol="USDC" amount={walletUsdc} usd={walletUsdc} />
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
