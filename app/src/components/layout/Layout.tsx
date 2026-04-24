import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { loadDevKeypair } from "@/lib/chain/devSigner";
import { TopNav } from "./TopNav";
import { ConnectPrompt } from "./ConnectPrompt";

/**
 * Layout — top-level chrome for every route.
 *
 * Background is composed of three *atmospheric* layers (no geometric
 * grid — that was the "unfinished" look):
 *
 *   1. Warm accent glow, top-center — anchors the hero.
 *   2. Cool ambient fill, bottom — keeps the fold from feeling cut.
 *   3. Fine SVG turbulence noise — gives the black a "material"
 *      quality instead of a flat paint.
 *
 * All fixed so scrolling doesn't reveal edges.
 */
export function Layout() {
  const { connected } = useWallet();
  const devKey = useMemo(() => loadDevKeypair(), []);
  const effectivelyConnected = connected || !!devKey;

  return (
    <div className="relative min-h-screen flex flex-col">
      <BackgroundAtmosphere />
      <div className="relative z-10 flex flex-col flex-1">
        <TopNav />
        <main className="flex-1 w-full max-w-page mx-auto px-6 py-10">
          {effectivelyConnected ? <Outlet /> : <ConnectPrompt />}
        </main>
        <Footer />
      </div>
    </div>
  );
}

function BackgroundAtmosphere() {
  return (
    <>
      {/* Primary: warm accent glow, top-center. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% -5%, rgba(107, 191, 138, 0.22) 0%, rgba(107, 191, 138, 0.06) 35%, rgba(107, 191, 138, 0) 70%)",
        }}
      />

      {/* Secondary: cool ambient at the bottom so pages don't feel cropped. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[55vh] z-0"
        style={{
          background:
            "radial-gradient(70% 90% at 50% 100%, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0) 80%)",
        }}
      />

      {/* Very subtle accent halo off to one side — breaks the symmetry. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(28% 28% at 88% 22%, rgba(107, 191, 138, 0.10) 0%, rgba(107, 191, 138, 0) 70%)",
        }}
      />

      {/* Fine noise texture — SVG turbulence, tiled. Gives the dark
          background a "film grain" material quality. baseFrequency
          controls grain size; opacity keeps it barely perceptible. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.22] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
          )}")`,
          backgroundSize: "240px 240px",
        }}
      />
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-page mx-auto px-6 py-6 flex items-center justify-between text-xs text-fg-subtle">
        <span>NutriFi · Devnet</span>
        <div className="flex gap-6">
          <a className="hover:text-fg transition-colors" href="#">
            Docs
          </a>
          <a className="hover:text-fg transition-colors" href="#">
            GitHub
          </a>
          <a className="hover:text-fg transition-colors" href="#">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
