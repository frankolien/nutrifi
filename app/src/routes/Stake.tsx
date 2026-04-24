import { useState } from "react";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useStakingState } from "@/hooks/useStakingState";
import { useActiveSigner, useSendTx } from "@/hooks/useSendTx";
import { buildClaimRewardsIx } from "@/lib/chain/ix";
import { humanizeError } from "@/lib/chain/errors";
import { formatToken, formatUsd } from "@/lib/format";
import { CONFIG, NSOL_DECIMALS, USDC_DECIMALS } from "@/lib/config";
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
 * Stake — detail view. ManageCard below handles stake/unstake; this
 * page adds the claim button + a live wallet-balance summary.
 */
export default function Stake() {
  const { data: live } = useUserPosition();
  const { data: staking } = useStakingState();
  const { publicKey } = useActiveSigner();
  const sendTx = useSendTx();
  const [err, setErr] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const walletSol = live?.position.walletSol ?? 0;
  const walletNsol = live
    ? Number(live.walletBalances.nsolLamports) / 10 ** NSOL_DECIMALS
    : 0;
  const walletUsdc = live
    ? Number(live.walletBalances.usdcLamports) / 10 ** USDC_DECIMALS
    : 0;

  const pending = staking?.pendingRewards ?? 0;
  const canClaim = !!publicKey && !!staking && pending > 0 && !sendTx.isPending;

  const onClaim = async () => {
    if (!publicKey || !CONFIG.nutMint) return;
    setErr(null);
    setSig(null);
    try {
      const s = await sendTx.mutateAsync({
        instructions: [buildClaimRewardsIx(publicKey)],
        ensureAtasFor: [CONFIG.nutMint],
      });
      setSig(s);
    } catch (e) {
      setErr(humanizeError(e));
    }
  };

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
                  value={pending}
                  format={(v) => formatToken(v, 4)}
                  className="num text-2xl font-medium"
                />
                <TokenBadge symbol="NUT" />
              </div>
              <div className="num text-xs text-fg-muted mt-1">
                {staking
                  ? `Earns per second while staked.`
                  : `Staking not initialized yet.`}
              </div>
              {err && <div className="text-xs text-alert mt-2">{err}</div>}
              {sig && (
                <div className="text-xs text-accent mt-2 num">
                  ✓ claimed · {sig.slice(0, 8)}…
                </div>
              )}
            </div>
            <Button
              variant="primary"
              onClick={onClaim}
              disabled={!canClaim}
              className="h-10 px-5"
            >
              {sendTx.isPending ? "…" : "Claim"}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="divide-y divide-border">
            <BalanceRow symbol="SOL" amount={walletSol} usd={walletSol * (live?.prices.sol ?? 0)} />
            <BalanceRow
              symbol="nSOL"
              amount={walletNsol}
              usd={walletNsol * (live?.prices.nsol ?? 0)}
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
