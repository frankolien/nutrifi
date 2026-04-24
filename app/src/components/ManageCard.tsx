import { useMemo, useState } from "react";
import { useMockStore } from "@/mock/data";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useSendTx, useActiveSigner } from "@/hooks/useSendTx";
import { evaluateHealth } from "@/lib/health";
import { formatPct, formatToken, formatUsd } from "@/lib/format";
import { CONFIG, NSOL_DECIMALS, USDC_DECIMALS } from "@/lib/config";
import {
  buildBorrowIx,
  buildDepositCollateralIx,
  buildRepayIx,
  buildStakeIx,
  buildUnstakeIx,
  buildWithdrawCollateralIx,
} from "@/lib/chain/ix";
import { humanizeError } from "@/lib/chain/errors";
import { useStakingState } from "@/hooks/useStakingState";
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
type BorrowMode = "deposit" | "borrow" | "repay" | "withdraw";

interface ManageCardProps {
  initialTab?: TopTab;
  compact?: boolean;
}

export function ManageCard({ initialTab = "stake" }: ManageCardProps) {
  const [tab, setTab] = useState<TopTab>(initialTab);

  return (
    <div className="w-full max-w-action mx-auto">
      <div className="rounded-lg border border-border bg-surface/60 backdrop-blur-sm p-4 sm:p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_60px_-30px_rgba(0,0,0,0.6)]">
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
  const { publicKey: signerPubkey } = useActiveSigner();
  const connected = !!signerPubkey;
  const publicKey = signerPubkey;
  const { data: live } = useUserPosition();
  const { data: staking } = useStakingState();
  const sendTx = useSendTx();

  const [mode, setMode] = useState<StakeMode>("stake");
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<
    | { kind: "idle" }
    | { kind: "pending" }
    | { kind: "success"; sig: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const stakingAvailable = !!staking;
  const exchangeRate = staking?.exchangeRate ?? 1.0; // SOL per nSOL
  const parsed = parseFloat(amount) || 0;

  const fromSym: AssetSymbol = mode === "stake" ? "SOL" : "nSOL";
  const toSym: AssetSymbol = mode === "stake" ? "nSOL" : "SOL";

  // stake: receive nSOL = SOL / exchangeRate
  // unstake: receive SOL = nSOL × exchangeRate
  const receive = mode === "stake" ? parsed / exchangeRate : parsed * exchangeRate;

  const walletSol = live?.position.walletSol ?? 0;
  const walletNsol = live
    ? Number(live.walletBalances.nsolLamports) / 10 ** NSOL_DECIMALS
    : 0;
  // Reserve 0.01 SOL for fees when max-staking.
  const maxStakeable = Math.max(0, walletSol - 0.01);
  const maxUnstakeable = walletNsol;
  const maxAvailable = mode === "stake" ? maxStakeable : maxUnstakeable;

  const error =
    parsed > 0 && parsed > maxAvailable ? "Insufficient balance" : null;

  const disabled =
    !connected || !stakingAvailable || parsed <= 0 || !!error || sendTx.isPending;

  const onSubmit = async () => {
    if (!publicKey || disabled) return;
    setTxStatus({ kind: "pending" });
    try {
      const lamports = BigInt(Math.round(parsed * 10 ** NSOL_DECIMALS));
      const ix =
        mode === "stake"
          ? buildStakeIx(publicKey, lamports)
          : buildUnstakeIx(publicKey, lamports);
      const sig = await sendTx.mutateAsync({
        instructions: [ix],
        ensureAtasFor: [CONFIG.collateralMint],
      });
      setTxStatus({ kind: "success", sig });
      setAmount("");
    } catch (e) {
      setTxStatus({ kind: "error", message: humanizeError(e) });
    }
  };

  const rewardApyPct = staking ? staking.rewardApy * 100 : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">
          {mode === "stake" ? "You stake" : "You unstake"}
        </span>
        <SegmentedControl<StakeMode>
          size="sm"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAmount("");
            setTxStatus({ kind: "idle" });
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
        balanceLabel={`Wallet ${formatToken(
          mode === "stake" ? walletSol : walletNsol,
          4,
        )} ${fromSym}`}
        onMax={() => setAmount(String(maxAvailable))}
        maxValue={maxAvailable}
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
            label: "Reward APY",
            value: rewardApyPct != null ? `${rewardApyPct.toFixed(2)}%` : "—",
            accent: true,
          },
          {
            label: mode === "stake" ? "Lockup" : "Cooldown",
            value: "Instant",
          },
          {
            label: "Network fee",
            value: "~0.000005 SOL",
          },
        ]}
      />

      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full h-12 mt-5 text-base"
      >
        {!stakingAvailable
          ? "Staking not initialized"
          : sendTx.isPending
          ? mode === "stake"
            ? "Staking…"
            : "Unstaking…"
          : mode === "stake"
          ? "Stake SOL"
          : "Unstake nSOL"}
      </Button>

      {txStatus.kind === "success" && (
        <p className="text-xs text-accent mt-3 text-center num">
          ✓ confirmed · {txStatus.sig.slice(0, 8)}…
        </p>
      )}
      {txStatus.kind === "error" && (
        <div className="mt-3 rounded border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert text-center">
          {txStatus.message}
        </div>
      )}
      {!stakingAvailable && (
        <p className="text-xs text-fg-subtle mt-3 text-center">
          Run `yarn bootstrap-all` to initialize the staking program.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Borrow --------------------------------- */

function BorrowPanel() {
  const { publicKey: signerPubkey } = useActiveSigner();
  const connected = !!signerPubkey;
  const publicKey = signerPubkey;
  const { data: live } = useUserPosition();
  const { data: protocol } = useProtocolStats();
  const mockPosition = useMockStore((s) => s.position);
  const mockPrices = useMockStore((s) => s.prices);

  const position = connected && live ? live.position : mockPosition;
  const prices = connected && live ? live.prices : mockPrices;
  const borrowAprPct = protocol ? protocol.borrowApr * 100 : 5.0;
  const liqThresholdPct = protocol ? protocol.liquidationThreshold : 0.8;

  const sendTx = useSendTx();
  const [mode, setMode] = useState<BorrowMode>("deposit");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<
    | { kind: "idle" }
    | { kind: "pending" }
    | { kind: "success"; sig: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const parsed = parseFloat(amount) || 0;

  const isCollateralSide = mode === "deposit" || mode === "withdraw";
  const tokenSym: AssetSymbol = isCollateralSide ? "nSOL" : "USDC";

  const health = useMemo(
    () => evaluateHealth(position, prices),
    [position, prices],
  );

  const previewHealth = useMemo(() => {
    const next = { ...position };
    if (mode === "deposit") next.collateral = position.collateral + parsed;
    else if (mode === "withdraw")
      next.collateral = Math.max(0, position.collateral - parsed);
    else if (mode === "borrow") next.debt = position.debt + parsed;
    else next.debt = Math.max(0, position.debt - parsed);
    return evaluateHealth(next, prices);
  }, [mode, parsed, position, prices]);

  // Wallet balances for preflight checks (deposit needs nSOL, repay needs USDC).
  const walletNsol = live
    ? Number(live.walletBalances.nsolLamports) / 1e9
    : 0;
  const walletUsdc = live
    ? Number(live.walletBalances.usdcLamports) / 10 ** USDC_DECIMALS
    : 0;

  const maxAvailable = (() => {
    switch (mode) {
      case "deposit":
        return walletNsol;
      case "withdraw":
        return position.collateral;
      case "borrow":
        return Math.max(0, health.borrowLimitUsd - position.debt);
      case "repay":
        return Math.min(position.debt, walletUsdc);
    }
  })();

  const wouldLiquidate =
    (mode === "borrow" || mode === "withdraw") &&
    parsed > 0 &&
    previewHealth.healthFactor < 1;

  const error = wouldLiquidate
    ? "Would liquidate your position"
    : Number.isFinite(maxAvailable) && parsed > maxAvailable
    ? "Exceeds available"
    : null;

  const disabled = !connected || parsed <= 0 || !!error || sendTx.isPending;

  const onSubmit = async () => {
    if (!publicKey || disabled) return;
    setConfirmOpen(false);
    setTxStatus({ kind: "pending" });
    try {
      let instructions;
      let ensureAtasFor;
      if (mode === "deposit") {
        const lamports = BigInt(Math.round(parsed * 1e9));
        instructions = [buildDepositCollateralIx(publicKey, lamports)];
        ensureAtasFor = [CONFIG.collateralMint];
      } else if (mode === "withdraw") {
        const lamports = BigInt(Math.round(parsed * 1e9));
        instructions = [buildWithdrawCollateralIx(publicKey, lamports)];
        ensureAtasFor = [CONFIG.collateralMint];
      } else if (mode === "borrow") {
        const lamports = BigInt(Math.round(parsed * 10 ** USDC_DECIMALS));
        instructions = [buildBorrowIx(publicKey, lamports)];
        ensureAtasFor = [CONFIG.debtMint];
      } else {
        const lamports = BigInt(Math.round(parsed * 10 ** USDC_DECIMALS));
        instructions = [buildRepayIx(publicKey, lamports)];
        ensureAtasFor = [CONFIG.debtMint];
      }
      const sig = await sendTx.mutateAsync({ instructions, ensureAtasFor });
      setTxStatus({ kind: "success", sig });
      setAmount("");
    } catch (e) {
      setTxStatus({ kind: "error", message: humanizeError(e) });
    }
  };

  const buttonLabel = {
    deposit: "Deposit nSOL",
    withdraw: "Withdraw nSOL",
    borrow: "Borrow USDC",
    repay: "Repay USDC",
  }[mode];

  const pendingLabel = {
    deposit: "Depositing…",
    withdraw: "Withdrawing…",
    borrow: "Borrowing…",
    repay: "Repaying…",
  }[mode];

  const balanceLabel = (() => {
    switch (mode) {
      case "deposit":
        return `Wallet ${formatToken(walletNsol, 4)} nSOL`;
      case "withdraw":
        return `Supplied ${formatToken(position.collateral, 4)} nSOL`;
      case "borrow":
        return `Available $${formatUsd(maxAvailable)}`;
      case "repay":
        return `Debt $${formatUsd(position.debt)} · Wallet $${formatUsd(walletUsdc)}`;
    }
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">
          {mode === "deposit" && "You deposit"}
          {mode === "withdraw" && "You withdraw"}
          {mode === "borrow" && "You borrow"}
          {mode === "repay" && "You repay"}
        </span>
        <SegmentedControl<BorrowMode>
          size="sm"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAmount("");
            setTxStatus({ kind: "idle" });
          }}
          options={[
            { value: "deposit", label: "Deposit" },
            { value: "borrow", label: "Borrow" },
            { value: "repay", label: "Repay" },
            { value: "withdraw", label: "Withdraw" },
          ]}
        />
      </div>

      <AmountInput
        value={amount}
        onChange={setAmount}
        tokenBadge={<TokenBadge symbol={tokenSym} />}
        balanceLabel={balanceLabel}
        onMax={
          Number.isFinite(maxAvailable)
            ? () => setAmount(String(maxAvailable))
            : undefined
        }
        maxValue={Number.isFinite(maxAvailable) ? maxAvailable : undefined}
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
            value: (
              <span className="num text-alert/80">
                {borrowAprPct.toFixed(2)}%
              </span>
            ),
          },
          {
            label: "Liquidation at",
            value: (
              <span className="num">
                $
                {previewHealth.liquidationPriceUsd > 0
                  ? formatUsd(previewHealth.liquidationPriceUsd, 2)
                  : "—"}
                <span className="text-fg-muted"> / nSOL</span>
              </span>
            ),
          },
          {
            label: "Network fee",
            value: "~0.000005 SOL",
          },
        ]}
      />

      <Button
        variant="primary"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled}
        className="w-full h-12 mt-5 text-base"
      >
        {sendTx.isPending ? pendingLabel : buttonLabel}
      </Button>

      {txStatus.kind === "success" && (
        <p className="text-xs text-accent mt-3 text-center num">
          ✓ confirmed · {txStatus.sig.slice(0, 8)}…
        </p>
      )}
      {txStatus.kind === "error" && (
        <div className="mt-3 rounded border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert text-center">
          {txStatus.message}
        </div>
      )}
      {!connected && (
        <p className="text-xs text-fg-subtle mt-3 text-center">
          Connect a wallet to transact.
        </p>
      )}

      <p className="text-xs text-fg-subtle mt-3 text-center">
        Liquidation threshold is {formatPct(liqThresholdPct, 0)} of collateral value.
      </p>

      {confirmOpen && (
        <ConfirmModal
          mode={mode}
          amount={parsed}
          tokenSym={tokenSym}
          fromHealth={health.healthFactor}
          toHealth={previewHealth.healthFactor}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={onSubmit}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  mode,
  amount,
  tokenSym,
  fromHealth,
  toHealth,
  onCancel,
  onConfirm,
}: {
  mode: BorrowMode;
  amount: number;
  tokenSym: AssetSymbol;
  fromHealth: number;
  toHealth: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const verb = {
    deposit: "deposit",
    withdraw: "withdraw",
    borrow: "borrow",
    repay: "repay",
  }[mode];
  const hfBetter = toHealth >= fromHealth;
  const toAtRisk = toHealth < 1.3 && Number.isFinite(toHealth);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <div className="eyebrow mb-1">Confirm</div>
          <div className="text-lg font-medium">
            You will {verb}{" "}
            <span className="num">
              {formatToken(amount, 4)} {tokenSym}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Health factor</span>
            <span className="num">
              {Number.isFinite(fromHealth) ? `${fromHealth.toFixed(2)}×` : "∞"}
              <span className="text-fg-muted mx-2">→</span>
              <span
                className={
                  toAtRisk
                    ? "text-alert"
                    : hfBetter
                    ? "text-accent"
                    : "text-fg"
                }
              >
                {Number.isFinite(toHealth) ? `${toHealth.toFixed(2)}×` : "∞"}
              </span>
            </span>
          </div>
          {toAtRisk && (
            <div className="rounded border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert">
              Warning: resulting health factor is close to liquidation.
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex-1 h-10 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="flex-1 h-10 text-sm"
          >
            Confirm
          </Button>
        </div>
      </div>
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
