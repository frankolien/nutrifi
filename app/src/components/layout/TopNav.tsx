import { NavLink } from "react-router-dom";
import { cx } from "@/lib/cx";
import { useMockStore } from "@/mock/data";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/primitives";

/**
 * TopNav — wordmark, route nav, connect button.
 *
 * Jupiter-style: tall (64px), hairline bottom border, active route
 * marked by both a filled pill *and* accent text. The filled pill is
 * enough on its own; we include the text emphasis so keyboard-nav
 * focus is obvious without relying on outline alone.
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
  const connected = useMockStore((s) => s.connected);
  const walletAddress = useMockStore((s) => s.walletAddress);
  const connect = useMockStore((s) => s.connect);
  const disconnect = useMockStore((s) => s.disconnect);

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

        {connected ? (
          <button
            onClick={disconnect}
            className="num inline-flex items-center gap-2 text-xs text-fg-muted hover:text-fg border border-border hover:border-border-strong rounded h-9 px-3 transition-colors"
            title="Click to disconnect"
          >
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-accent opacity-75 animate-ping" />
              <span className="relative rounded-full w-1.5 h-1.5 bg-accent" />
            </span>
            {shortAddress(walletAddress)}
          </button>
        ) : (
          <Button variant="primary" onClick={connect} className="h-9 px-5 text-sm">
            Connect wallet
          </Button>
        )}
      </div>
    </header>
  );
}
