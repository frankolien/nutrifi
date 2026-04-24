import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cx } from "@/lib/cx";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useActiveSigner } from "@/hooks/useSendTx";
import { loadDevKeypair } from "@/lib/chain/devSigner";
import { formatToken, shortAddress } from "@/lib/format";
import {
  CONFIG,
  NSOL_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/config";

// Map the RPC URL back to a human cluster label. Matches how explorer.solana.com
// partitions clusters, plus "LOCALNET" for any 127.x / localhost URL.
function clusterLabel(url: string): string {
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCALNET";
  if (/devnet/.test(url)) return "DEVNET";
  if (/testnet/.test(url)) return "TESTNET";
  if (/mainnet|api\.mainnet-beta/.test(url)) return "MAINNET";
  return "CUSTOM";
}

/**
 * TopNav — wordmark, route nav, balance widget, connect button.
 *
 * Three breakpoints:
 *   - ≥lg (1024+): everything inline — 6-item nav row, SOL/nSOL/USDC
 *     balance strip, wallet button.
 *   - md–lg: nav inline but balance strip hidden.
 *   - <md: nav collapses into a hamburger drawer; only wordmark +
 *     wallet button visible on the bar.
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on route change — the drawer stays open otherwise
  // because the overlay click handler doesn't fire on NavLink press.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
        <div className="max-w-page mx-auto flex items-center h-14 sm:h-16 px-4 sm:px-6 gap-3 sm:gap-10">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <div className="relative w-7 h-7 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center">
              <div className="w-3 h-3 rounded-sm bg-accent" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              NutriFi
            </span>
            <EnvChip label={clusterLabel(CONFIG.cluster)} />
          </NavLink>

          {/* Inline nav — visible md+ */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
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

          {/* Spacer — pushes right-side controls when inline nav is hidden */}
          <div className="md:hidden flex-1" />

          {/* Balance strip — only wide viewports, fits ≥lg */}
          {connected && live && (
            <div className="hidden lg:flex items-center gap-4 pr-4 border-r border-border h-9">
              <BalanceCell
                label="SOL"
                value={live.position.walletSol}
                decimals={3}
              />
              <BalanceCell
                label="nSOL"
                value={
                  Number(live.walletBalances.nsolLamports) /
                  10 ** NSOL_DECIMALS
                }
                decimals={3}
              />
              <BalanceCell
                label="USDC"
                value={
                  Number(live.walletBalances.usdcLamports) /
                  10 ** USDC_DECIMALS
                }
                decimals={2}
              />
            </div>
          )}

          <div className="nutrifi-wallet-btn flex items-center shrink-0">
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

          {/* Hamburger — hidden md+, becomes the drawer trigger below */}
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded border border-border text-fg-muted hover:text-fg hover:bg-fg/[0.04] transition-colors shrink-0"
            aria-label="Toggle menu"
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      {/* Mobile drawer — slides down below header */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-bg/60 backdrop-blur-sm md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="fixed top-14 inset-x-0 z-40 md:hidden bg-bg border-b border-border shadow-xl">
            <nav className="max-w-page mx-auto px-4 py-3 flex flex-col">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    cx(
                      "h-11 px-3 flex items-center rounded text-sm font-medium transition-colors",
                      isActive
                        ? "bg-fg/[0.06] text-fg"
                        : "text-fg-muted hover:text-fg hover:bg-fg/[0.03]",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {connected && live && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3">
                  <BalanceCell
                    label="SOL"
                    value={live.position.walletSol}
                    decimals={3}
                    align="start"
                  />
                  <BalanceCell
                    label="nSOL"
                    value={
                      Number(live.walletBalances.nsolLamports) /
                      10 ** NSOL_DECIMALS
                    }
                    decimals={3}
                    align="start"
                  />
                  <BalanceCell
                    label="USDC"
                    value={
                      Number(live.walletBalances.usdcLamports) /
                      10 ** USDC_DECIMALS
                    }
                    decimals={2}
                    align="start"
                  />
                </div>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

function EnvChip({ label }: { label: string }) {
  const tone =
    label === "LOCALNET"
      ? "border-alert/40 text-alert/80 bg-alert/5"
      : label === "MAINNET"
      ? "border-accent/40 text-accent bg-accent/5"
      : "border-border text-fg-muted bg-fg/[0.03]";
  return (
    <span
      className={cx(
        "hidden sm:inline-flex ml-1 num text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded border",
        tone,
      )}
      title={`App is reading from ${CONFIG.cluster}. Make sure your wallet is set to the same network (Phantom: Settings → Developer Settings → Testnet Mode) or transactions will hang.`}
    >
      {label}
    </span>
  );
}

function BalanceCell({
  label,
  value,
  decimals,
  align = "end",
}: {
  label: string;
  value: number;
  decimals: number;
  align?: "start" | "end";
}) {
  return (
    <div
      className={cx(
        "flex flex-col leading-tight",
        align === "end" ? "items-end" : "items-start",
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      <span className="num text-xs tabular-nums text-fg">
        {formatToken(value, decimals)}
      </span>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 6h14M3 10h14M3 14h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
