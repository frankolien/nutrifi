/**
 * Root wrapper for anything that needs on-chain data or a wallet.
 *
 * Stack:
 *   QueryClientProvider          — caches getAccountInfo reads
 *     ConnectionProvider         — the Connection used by hooks
 *       WalletProvider           — which wallet adapters are available
 *         WalletModalProvider    — the connect-wallet popover
 *
 * Components use `useConnection()` + `useWallet()` from @solana/wallet-adapter-react.
 */

import { ReactNode, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

import { CONFIG } from "@/lib/config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Positions don't change faster than a block (~400ms). Default 5s
      // is fine for user-facing reads; routes that show a live leaderboard
      // (Liquidate, Activity) can set their own shorter staleTime.
      staleTime: 5_000,
      refetchInterval: 5_000,
      retry: 1,
    },
  },
});

export function ChainProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={CONFIG.cluster}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
