import { useMemo, useState } from "react";
import { useMockStore } from "@/mock/data";
import { formatToken, relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { Card, SegmentedControl, TokenMark } from "@/components/primitives";
import type { ActivityKind } from "@/types";

/**
 * Activity — your own transaction history.
 *
 * Segmented filter at top matches the rest of the site's chrome.
 * Rows show the action kind as a colored chip so scanning the list
 * at speed is easy.
 */

type Filter = "all" | "stake" | "borrow" | "rewards" | "liquidate";

const FILTER_MAP: Record<Filter, ActivityKind[] | null> = {
  all: null,
  stake: ["stake", "unstake"],
  borrow: ["borrow", "repay", "deposit", "withdraw"],
  rewards: ["claim"],
  liquidate: ["liquidate"],
};

const KIND_LABEL: Record<ActivityKind, string> = {
  stake: "Staked",
  unstake: "Unstaked",
  deposit: "Deposited",
  withdraw: "Withdrew",
  borrow: "Borrowed",
  repay: "Repaid",
  claim: "Claimed",
  liquidate: "Liquidated",
};

const KIND_ACCENT: Record<ActivityKind, string> = {
  stake: "text-accent",
  unstake: "text-fg",
  deposit: "text-accent",
  withdraw: "text-fg",
  borrow: "text-fg",
  repay: "text-accent",
  claim: "text-accent",
  liquidate: "text-alert",
};

export default function Activity() {
  const rows = useMockStore((s) => s.activity);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const kinds = FILTER_MAP[filter];
    if (!kinds) return rows;
    return rows.filter((r) => kinds.includes(r.kind));
  }, [rows, filter]);

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="Your transactions"
        description="Every action you've taken on NutriFi, newest first."
      />

      <SegmentedControl<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "stake", label: "Stake" },
          { value: "borrow", label: "Borrow" },
          { value: "rewards", label: "Rewards" },
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
              <th className="px-6 py-4 font-normal text-right">Amount</th>
              <th className="px-6 py-4 font-normal text-right">Signature</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
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
                <tr
                  key={r.id}
                  className={
                    (i < filtered.length - 1
                      ? "border-b border-border "
                      : "") +
                    "group hover:bg-fg/[0.02] transition-colors"
                  }
                >
                  <td className="px-6 py-4 text-xs text-fg-muted whitespace-nowrap">
                    {relativeTime(r.tsSec)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={KIND_ACCENT[r.kind]}>
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span className="num text-sm">
                        {formatToken(r.amount, 4)}
                      </span>
                      <TokenMark symbol={r.asset} size={18} />
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href="#"
                      className="num text-xs text-fg-muted hover:text-fg transition-colors"
                    >
                      {r.signature}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
