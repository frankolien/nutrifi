import { Button } from "@/components/primitives";
import { useMockStore } from "@/mock/data";

/**
 * ConnectPrompt — the disconnected landing page.
 *
 * Structure, top to bottom:
 *
 *   1. Hero headline + subhead (marketing copy, only shown while
 *      disconnected — disappears once the wallet connects).
 *   2. Connect card — centered horizontally, anchored below the
 *      headline, not vertically centered to the viewport.
 *   3. "What you can do" feature strip — three small unobtrusive
 *      cards so the page has bottom-of-fold content to keep going.
 *
 * Rule-of-thumb: disconnected = landing, connected = app. Don't
 * show marketing copy to someone who's here to move money.
 */
export function ConnectPrompt() {
  const connect = useMockStore((s) => s.connect);

  return (
    <div className="pt-12 pb-24">
      {/* Hero */}
      <div className="text-center max-w-readable mx-auto mb-14">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.03em] leading-[1.05] mb-5">
          Your SOL,
          <br />
          <span className="bg-gradient-to-r from-fg via-accent to-fg bg-clip-text text-transparent">
            working harder.
          </span>
        </h1>
        <p className="text-fg-muted text-base md:text-lg max-w-[32rem] mx-auto leading-relaxed">
          Stake to earn. Borrow without selling. One wallet, one position,
          one health factor.
        </p>
      </div>

      {/* Connect card */}
      <div className="relative w-full max-w-action mx-auto">
        {/* warm accent bloom sitting behind the card */}
        <div
          aria-hidden
          className="absolute -inset-10 rounded-[2rem] pointer-events-none"
          style={{
            background:
              "radial-gradient(55% 65% at 50% 45%, rgba(107, 191, 138, 0.20) 0%, rgba(107, 191, 138, 0) 75%)",
          }}
        />

        <div
          className="relative rounded-lg border border-border bg-surface/70 backdrop-blur-md p-7 text-center"
          style={{
            boxShadow:
              "0 0 0 1px rgba(107,191,138,0.08) inset, 0 30px 80px -40px rgba(0,0,0,0.8), 0 0 60px -20px rgba(107,191,138,0.15)",
          }}
        >
          <div className="w-11 h-11 mx-auto mb-5 rounded-md bg-accent/10 border border-accent/25 flex items-center justify-center">
            <div className="w-4 h-4 rounded-sm bg-accent" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Connect your wallet
          </h2>
          <p className="text-fg-muted text-sm max-w-sm mx-auto mb-7">
            NutriFi needs a Solana wallet to read your position and sign
            transactions. We never take custody of your assets.
          </p>

          <Button
            variant="primary"
            onClick={connect}
            className="h-11 w-full text-base"
          >
            Connect wallet
          </Button>

          <p className="text-xs text-fg-subtle mt-5">
            Devnet · read-only preview with mock data
          </p>
        </div>
      </div>

      {/* Feature strip */}
      <div className="mt-20 max-w-page mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            label="Stake"
            title="Earn while you stake"
            body="Deposit SOL, receive nSOL. Earn base staking yield plus NUT rewards that accrue every second."
          />
          <FeatureCard
            label="Borrow"
            title="Unlock your collateral"
            body="Use nSOL as collateral and borrow USDC at up to 75% LTV. Repay anytime. No unstaking required."
            accent
          />
          <FeatureCard
            label="Liquidate"
            title="Earn by keeping markets honest"
            body="Permissionless liquidations. Repay unhealthy loans, seize collateral at a 5% discount."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  label,
  title,
  body,
  accent,
}: {
  label: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "group relative rounded-lg border p-6 transition-colors " +
        (accent
          ? "border-accent/30 bg-accent/[0.04] hover:border-accent/50"
          : "border-border bg-surface/40 hover:border-border-strong")
      }
    >
      <div
        className={
          "eyebrow mb-4 " + (accent ? "text-accent" : "text-fg-subtle")
        }
      >
        {label}
      </div>
      <div className="text-base font-semibold mb-2 tracking-tight">{title}</div>
      <p className="text-sm text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}
