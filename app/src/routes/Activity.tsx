import { useMemo, useState } from "react";
import {
  useRecentActivity,
  ActivityKind,
  ActivityItem,
} from "@/hooks/useRecentActivity";
import { CONFIG } from "@/lib/config";
import { relativeTime, shortAddress } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { Card, SegmentedControl } from "@/components/primitives";

/**
 * Activity — full list of the signer's on-chain actions.
 *
 * Data source: `getSignaturesForAddress` on the user's UserLoan PDA
 * (every deposit/borrow/repay/withdraw/liquidate touches it), then one
 * `getTransaction` per sig to classify + extract the program log.
 *
 * Limited to the last 50 sigs. For a real indexer the loan PDA would
 * land in a postgres row the moment the program emits it.
 */

type Filter = "all" | "collateral" | "debt" | "liquidate";

const FILTER_KINDS: Record<Filter, ActivityKind[] | null> = {
  all: null,
  collateral: ["deposit", "withdraw"],
  debt: ["borrow", "repay"],
  liquidate: ["liquidate"],
};

const KIND_LABEL: Record<ActivityKind, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidate: "Liquidate",
  other: "Other",
};

const KIND_ACCENT: Record<ActivityKind, string> = {
  deposit: "text-accent",
  withdraw: "text-fg",
  borrow: "text-fg",
  repay: "text-accent",
  liquidate: "text-alert",
  other: "text-fg-muted",
};

export default function Activity() {
  const { data: rows = [], isLoading } = useRecentActivity(50);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const kinds = FILTER_KINDS[filter];
    if (!kinds) return rows;
    return rows.filter((r) => kinds.includes(r.kind));
  }, [rows, filter]);

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="Your transactions"
        description="Every action you've taken on NutriFi, newest first. Click a row to open it in Solana Explorer."
      />

      <SegmentedControl<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "collateral", label: "Collateral" },
          { value: "debt", label: "Debt" },
          { value: "liquidate", label: "Liquidate" },
        ]}
        className="mb-6"
      />

      <Card>
        <table className="w-full">
          <thead>
            <tr className="eyebrow text-left border-b border-border">
              <th className="px-6 py-4 font-normal">When</th>
              <th className="px-6 py-4 font-normal">Action</th>
              <th className="px-6 py-4 font-normal">Detail</th>
              <th className="px-6 py-4 font-normal text-right">Signature</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-16 text-center text-sm text-fg-muted"
                >
                  Loading your activity…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-16 text-center text-sm text-fg-muted"
                >
                  No transactions match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <Row
                  key={r.signature}
                  item={r}
                  isLast={i === filtered.length - 1}
                />
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Row({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const explorer = `https://explorer.solana.com/tx/${item.signature}?cluster=custom&customUrl=${encodeURIComponent(CONFIG.cluster)}`;
  return (
    <tr
      className={
        (isLast ? "" : "border-b border-border ") +
        "group hover:bg-fg/[0.02] transition-colors cursor-pointer"
      }
      onClick={() => window.open(explorer, "_blank", "noreferrer")}
    >
      <td className="px-6 py-4 text-xs text-fg-muted whitespace-nowrap">
        {item.tsSec ? relativeTime(item.tsSec) : "pending"}
      </td>
      <td className="px-6 py-4 text-sm">
        <span className={KIND_ACCENT[item.kind]}>{KIND_LABEL[item.kind]}</span>
        {!item.success && (
          <span className="ml-2 text-alert/70 text-[10px] uppercase tracking-wider">
            failed
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-xs text-fg-muted num truncate max-w-[32rem]">
        {item.summary}
      </td>
      <td className="px-6 py-4 text-right">
        <span className="num text-xs text-fg-muted group-hover:text-fg transition-colors">
          {shortAddress(item.signature, 6)} ↗
        </span>
      </td>
    </tr>
  );
}
