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
        {isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<ClockIcon />}
            title="Loading your activity…"
            body="Fetching signatures from your UserLoan PDA."
          />
        ) : filtered.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon />}
              title="No activity yet"
              body={
                <>
                  Your first deposit, borrow, or stake will land here.
                  <br />
                  Head to the dashboard to open a position.
                </>
              }
            />
          ) : (
            <EmptyState
              icon={<FilterIcon />}
              title="Nothing matches this filter"
              body="Try a different tab to see other actions."
            />
          )
        ) : (
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
              {filtered.map((r, i) => (
                <Row
                  key={r.signature}
                  item={r}
                  isLast={i === filtered.length - 1}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-20">
      <div className="w-12 h-12 rounded-full border border-border bg-fg/[0.02] flex items-center justify-center text-fg-muted mb-4">
        {icon}
      </div>
      <div className="text-sm text-fg mb-1.5">{title}</div>
      <div className="text-xs text-fg-muted leading-relaxed max-w-xs">
        {body}
      </div>
    </div>
  );
}

function ReceiptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 7h4M8 10h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 5h14l-5.5 7v4l-3 1v-5L3 5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 6v4l2.5 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
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
