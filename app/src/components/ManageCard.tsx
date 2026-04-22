import { useMemo, useState } from "react";
import { useMockStore } from "@/mock/data";
import { evaluateHealth } from "@/lib/health";
import { formatPct, formatToken, formatUsd } from "@/lib/format";
import {
  AmountInput,
  AnimatedNumber,
  Button,
  SegmentedControl,
  TokenBadge,
} from "@/components/primitives";
import type { AssetSymbol } from "@/types";

/**
 * ManageCard — the single big action card that owns the whole
 * "do stuff" surface. Drops onto `/` (dashboard), `/stake`, `/borrow`,
 * and decides what to show based on the initial `tab`.
 *
 * Three top-level tabs: Stake / Borrow / Repay. Stake is mirrored in
 * one card (stake <-> unstake inner toggle), Borrow is mirrored
 * (deposit/borrow <-> withdraw/repay), Repay is a shortcut alias for
 * the debt-side repay action that deserves its own entry point.
 *
 * Design rules (copied from Jupiter):
 *   - One card, centered, max ~480px wide.
 *   - Top: segmented control for the *mode*.
 *   - Middle: the input + token + max.
 *   - Inline preview rows *inside* the card below input.
 *   - Single green commit button at the bottom.
 *   - Animated values for the "you receive" / "new health" figures.
 */

type TopTab = "stake" | "borrow";
type StakeMode = "stake" | "unstake";
type BorrowMode = "borrow" | "repay";

interface ManageCardProps {
  initialTab?: TopTab;
  compact?: boolean;
}

export function ManageCard({ initialTab = "stake" }: ManageCardProps) {
  const [tab, setTab] = useState<TopTab>(initialTab);

  return (
    <div className="w-full max-w-action mx-auto">
      <div className="rounded-lg border border-border bg-surface/60 backdrop-blur-sm p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_60px_-30px_rgba(0,0,0,0.6)]">
        <SegmentedControl<TopTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "stake", label: "Stake" },
            { value: "borrow", label: "Borrow" },
          ]}
          className="w-full [&>button]:flex-1"
        />

        <div className="mt-5">
          {tab === "stake" ? <StakePanel /> : <BorrowPanel />}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Stake ---------------------------------- */

function StakePanel() {
  const position = useMockStore((s) => s.position);
  const stake = useMockStore((s) => s.stake);
  const unstake = useMockStore((s) => s.unstake);

  const [mode, setMode] = useState<StakeMode>("stake");
  const [amount, setAmount] = useState("");

  const exchangeRate = 1.0034; // placeholder until real accrual data is wired.
  const parsed = parseFloat(amount) || 0;

  const fromSym: AssetSymbol = mode === "stake" ? "SOL" : "nSOL";
  const toSym: AssetSymbol = mode === "stake" ? "nSOL" : "SOL";

  const receive =
    mode === "stake" ? parsed / exchangeRate : parsed * 0.9966;

  const maxAvailable =
    mode === "stake" ? position.walletSol : position.collateral;

  const error =
    parsed > 0 && parsed > maxAvailable ? "Insufficient balance" : null;

  const disabled = parsed <= 0 || !!error;

  const onSubmit = () => {
    if (disabled) return;
    if (mode === "stake") stake(parsed);
    else unstake(parsed);
    setAmount("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">{mode === "stake" ? "You stake" : "You unstake"}</span>
        <SegmentedControl<StakeMode>
          size="sm"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAmount("");
          }}
          options={[
            { value: "stake", label: "Stake" },
            { value: "unstake", label: "Unstake" },
          ]}
        />
      </div>

      <AmountInput
        value={amount}
        onChange={setAmount}
        tokenBadge={<TokenBadge symbol={fromSym} />}
        balanceLabel={`${formatToken(maxAvailable, 4)} ${fromSym}`}
        onMax={() => setAmount(String(maxAvailable))}
        error={error ?? undefined}
      />

      <Arrow />

      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">You receive</span>
      </div>
      <div className="flex items-center gap-3 rounded-md border border-border bg-fg/[0.02] px-4 h-16">
        <AnimatedNumber
          value={receive}
          format={(v) => formatToken(v, 4)}
          className="num flex-1 min-w-0 text-3xl font-medium tabular-nums text-fg"
        />
        <TokenBadge symbol={toSym} />
      </div>

      <PreviewRows
        rows={[
          {
            label: "Rate",
            value: `1 SOL = ${formatToken(1 / exchangeRate, 4)} nSOL`,
          },
          {
            label: mode === "stake" ? "Stake APY" : "Est. unstake fee",
            value: mode === "stake" ? "8.14%" : "—",
            accent: mode === "stake",
          },
        ]}
      />

      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full h-12 mt-5 text-base"
      >
        {mode === "stake" ? "Stake SOL" : "Unstake nSOL"}
      </Button>
    </div>
  );
}

/* ----------------------------- Borrow --------------------------------- */

function BorrowPanel() {
  const position = useMockStore((s) => s.position);
  const prices = useMockStore((s) => s.prices);
  const borrow = useMockStore((s) => s.borrow);
  const repay = useMockStore((s) => s.repay);

  const [mode, setMode] = useState<BorrowMode>("borrow");
  const [amount, setAmount] = useState("");

  const parsed = parseFloat(amount) || 0;

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );

  const previewHealth = useMemo(() => {
    const delta = mode === "borrow" ? parsed : -parsed;
    return evaluateHealth(
      { ...position, debt: Math.max(0, position.debt + delta) },
      prices,
    );
  }, [mode, parsed, position, prices]);

  const maxAvailable =
    mode === "borrow"
      ? Math.max(0, health.borrowLimitUsd - position.debt)
      : position.debt;

  const wouldLiquidate =
    mode === "borrow" && parsed > 0 && previewHealth.healthFactor < 1;

  const error = wouldLiquidate
    ? "Would liquidate your position"
    : parsed > maxAvailable
    ? "Exceeds available"
    : null;

  const disabled = parsed <= 0 || !!error;

  const onSubmit = () => {
    if (disabled) return;
    if (mode === "borrow") borrow(parsed);
    else repay(parsed);
    setAmount("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">
          {mode === "borrow" ? "You borrow" : "You repay"}
        </span>
        <SegmentedControl<BorrowMode>
          size="sm"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAmount("");
          }}
          options={[
            { value: "borrow", label: "Borrow" },
            { value: "repay", label: "Repay" },
          ]}
        />
      </div>

      <AmountInput
        value={amount}
        onChange={setAmount}
        tokenBadge={<TokenBadge symbol="USDC" />}
        balanceLabel={
          mode === "borrow"
            ? `Available $${formatUsd(maxAvailable)}`
            : `Debt $${formatUsd(maxAvailable)}`
        }
        onMax={() => setAmount(String(maxAvailable))}
        error={error ?? undefined}
      />

      <PreviewRows
        rows={[
          {
            label: "New health factor",
            value: (
              <span className="num">
                {Number.isFinite(health.healthFactor)
                  ? `${health.healthFactor.toFixed(2)}×`
                  : "∞"}
                <span className="text-fg-muted"> → </span>
                <AnimatedNumber
                  value={
                    Number.isFinite(previewHealth.healthFactor)
                      ? previewHealth.healthFactor
                      : 99
                  }
                  format={(v) => (v >= 99 ? "∞" : `${v.toFixed(2)}×`)}
                  className={
                    previewHealth.healthFactor < 1
                      ? "text-alert"
                      : previewHealth.healthFactor >= health.healthFactor
                      ? "text-accent"
                      : "text-fg"
                  }
                />
              </span>
            ),
          },
          {
            label: "Utilization",
            value: (
              <AnimatedNumber
                value={previewHealth.utilization * 100}
                format={(v) => `${v.toFixed(1)}%`}
                className="num"
              />
            ),
          },
          {
            label: "Borrow APR",
            value: <span className="num text-alert/80">6.72%</span>,
          },
        ]}
      />

      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full h-12 mt-5 text-base"
      >
        {mode === "borrow" ? "Borrow USDC" : "Repay USDC"}
      </Button>

      <p className="text-xs text-fg-subtle mt-3 text-center">
        Liquidation threshold is {formatPct(0.8, 0)} of collateral value.
      </p>
    </div>
  );
}

/* --------------------------- Helpers ---------------------------------- */

function PreviewRows({
  rows,
}: {
  rows: { label: string; value: React.ReactNode; accent?: boolean }[];
}) {
  return (
    <div className="mt-4 rounded-md border border-border bg-fg/[0.02] px-4 py-3 space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-sm">
          <span className="text-fg-muted">{r.label}</span>
          <span className={r.accent ? "text-accent num" : "num"}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center my-2">
      <div className="w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-fg-muted"
        >
          <path
            d="M7 2 L 7 11 M 3.5 7.5 L 7 11 L 10.5 7.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
