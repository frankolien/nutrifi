import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cx } from "@/lib/cx";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useActiveSigner } from "@/hooks/useSendTx";
import { loadDevKeypair } from "@/lib/chain/devSigner";
import { formatToken, shortAddress } from "@/lib/format";
import {
  NSOL_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/config";

/**
 * TopNav — wordmark, route nav, balance widget, connect button.
 *
 * When connected, a compact balance strip shows the three assets the
 * protocol cares about (SOL / nSOL / USDC) in JetBrains Mono so digits
 * stay tabular. Ellipsis fallback for small screens isn't implemented —
 * the page isn't meant for mobile.
 */

const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "Dashboard", path: "/" },
  { label: "Stake", path: "/stake" },
  { label: "Borrow", path: "/borrow" },
  { label: "Markets", path: "/markets" },
  { label: "Liquidate", path: "/liquidate" },
  { label: "Activity", path: "/activity" },
];

export function TopNav() {
  const { publicKey, isDev } = useActiveSigner();
  const connected = !!publicKey;
  const devKey = useMemo(() => loadDevKeypair(), []);
  const { data: live } = useUserPosition();

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
      <div className="max-w-page mx-auto flex items-center h-16 px-6 gap-10">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="relative w-7 h-7 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center">
            <div className="w-3 h-3 rounded-sm bg-accent" />
          </div>
          <span className="text-sm font-semibold tracking-tight">NutriFi</span>
        </NavLink>

        <nav className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cx(
                  "relative h-8 px-3 flex items-center rounded text-sm font-medium transition-colors",
                  isActive
                    ? "bg-fg/[0.06] text-fg"
                    : "text-fg-muted hover:text-fg hover:bg-fg/[0.03]",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {connected && live && (
          <div className="hidden md:flex items-center gap-4 pr-4 border-r border-border h-9">
            <BalanceCell
              label="SOL"
              value={live.position.walletSol}
              decimals={3}
            />
            <BalanceCell
              label="nSOL"
              value={Number(live.walletBalances.nsolLamports) / 10 ** NSOL_DECIMALS}
              decimals={3}
            />
            <BalanceCell
              label="USDC"
              value={Number(live.walletBalances.usdcLamports) / 10 ** USDC_DECIMALS}
              decimals={2}
            />
          </div>
        )}

        <div className="nutrifi-wallet-btn flex items-center">
          {isDev && devKey ? (
            <div
              className="num inline-flex items-center gap-2 text-xs text-fg-muted border border-border bg-fg/[0.04] rounded h-9 px-3"
              title="Dev signer active — VITE_DEV_SIGNER_SECRET is set. Remove from .env.local to use a browser wallet."
            >
              <span className="text-[9px] uppercase tracking-[0.12em] text-alert/70">
                dev signer
              </span>
              <span className="text-fg">
                {shortAddress(devKey.publicKey.toBase58())}
              </span>
            </div>
          ) : (
            <WalletMultiButton />
          )}
        </div>
      </div>
    </header>
  );
}

function BalanceCell({
  label,
  value,
  decimals,
}: {
  label: string;
  value: number;
  decimals: number;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      <span className="num text-xs tabular-nums text-fg">
        {formatToken(value, decimals)}
      </span>
    </div>
  );
}
