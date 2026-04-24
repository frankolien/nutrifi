/**
 * Right-hand sidebar: live protocol signals + recent user activity.
 *
 * Rendered next to ManageCard on the Dashboard. Three rows:
 *   1. Oracle — current price + staleness. If stale, warn in red.
 *   2. Wallet — SOL / nSOL / USDC balances. Redundant with TopNav, but
 *      users scanning the dashboard shouldn't have to look up.
 *   3. Recent activity — last 10 txs on this user's loan PDA, newest first.
 */

import { useMemo } from "react";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useRecentActivity, ActivityKind } from "@/hooks/useRecentActivity";
import { formatToken, formatUsd, shortAddress } from "@/lib/format";
import { Card } from "@/components/primitives";
import { CONFIG, NSOL_DECIMALS, USDC_DECIMALS } from "@/lib/config";

const KIND_META: Record<ActivityKind, { label: string; color: string }> = {
  deposit: { label: "Deposit", color: "text-accent" },
  borrow: { label: "Borrow", color: "text-fg" },
  repay: { label: "Repay", color: "text-fg" },
  withdraw: { label: "Withdraw", color: "text-fg-muted" },
  liquidate: { label: "Liquidate", color: "text-alert" },
  other: { label: "Other", color: "text-fg-muted" },
};

export function Sidebar() {
  return (
    <div className="w-full lg:max-w-xs flex flex-col gap-4">
      <OracleCard />
      <BalancesCard />
      <ActivityCard />
    </div>
  );
}

function OracleCard() {
  const { data: protocol } = useProtocolStats();
  const now = Math.floor(Date.now() / 1000);

  if (!protocol) {
    return (
      <Card>
        <div className="p-4">
          <div className="eyebrow mb-2">Oracle</div>
          <div className="text-xs text-fg-muted">Loading…</div>
        </div>
      </Card>
    );
  }

  const publishedTs = Number(protocol.oracle.publishedTs);
  const maxStaleness = Number(protocol.oracle.maxStalenessSeconds);
  const age = now - publishedTs;
  const stale = age > maxStaleness;

  return (
    <Card>
      <div className="p-4">
        <div className="eyebrow mb-3">Oracle</div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-fg-muted">nSOL price</span>
          <span className="num text-sm">
            ${formatUsd(protocol.usdPerNsol, 4)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-fg-muted">Updated</span>
          <span
            className={`num text-xs ${stale ? "text-alert" : "text-fg-muted"}`}
          >
            {formatAge(age)} ago
            {stale && " · stale"}
          </span>
        </div>
        {stale && (
          <p className="mt-3 text-[10px] text-alert leading-snug">
            Price is older than the {maxStaleness}s max; on-chain reads will
            revert until refreshed.
          </p>
        )}
      </div>
    </Card>
  );
}

function BalancesCard() {
  const { data: live } = useUserPosition();

  const sol = live?.position.walletSol ?? 0;
  const nsol = live
    ? Number(live.walletBalances.nsolLamports) / 10 ** NSOL_DECIMALS
    : 0;
  const usdc = live
    ? Number(live.walletBalances.usdcLamports) / 10 ** USDC_DECIMALS
    : 0;

  return (
    <Card>
      <div className="p-4">
        <div className="eyebrow mb-3">Wallet</div>
        <Row label="SOL" value={formatToken(sol, 4)} />
        <Row label="nSOL" value={formatToken(nsol, 4)} />
        <Row label="USDC" value={formatToken(usdc, 2)} />
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="num text-sm tabular-nums">{value}</span>
    </div>
  );
}

function ActivityCard() {
  const { data: activity = [], isLoading } = useRecentActivity();

  return (
    <Card>
      <div className="p-4">
        <div className="eyebrow mb-3">Recent activity</div>
        {isLoading && activity.length === 0 && (
          <div className="text-xs text-fg-muted">Loading…</div>
        )}
        {!isLoading && activity.length === 0 && (
          <div className="text-xs text-fg-muted">
            Your first deposit will show here.
          </div>
        )}
        <ul className="space-y-3">
          {activity.map((a) => (
            <ActivityRow key={a.signature} item={a} />
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ActivityRow({
  item,
}: {
  item: ReturnType<typeof useRecentActivity>["data"] extends
    | (infer T)[]
    | undefined
    ? T
    : never;
}) {
  const meta = KIND_META[item.kind];
  const explorer = useMemo(
    () =>
      `https://explorer.solana.com/tx/${item.signature}?cluster=custom&customUrl=${encodeURIComponent(CONFIG.cluster)}`,
    [item.signature],
  );
  const ago = useMemo(() => {
    if (!item.tsSec) return "pending";
    return formatAge(Math.floor(Date.now() / 1000) - item.tsSec) + " ago";
  }, [item.tsSec]);

  return (
    <li>
      <a
        href={explorer}
        target="_blank"
        rel="noreferrer"
        className="block hover:bg-fg/[0.03] rounded px-2 -mx-2 py-1 transition-colors"
      >
        <div className="flex items-baseline justify-between text-xs">
          <span className={`${meta.color} font-medium`}>
            {meta.label}
            {!item.success && (
              <span className="ml-2 text-alert/70 text-[10px] uppercase tracking-wider">
                failed
              </span>
            )}
          </span>
          <span className="num text-fg-subtle">{ago}</span>
        </div>
        <div className="num text-[10px] text-fg-muted mt-0.5">
          {shortAddress(item.signature, 6)}
        </div>
      </a>
    </li>
  );
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}
