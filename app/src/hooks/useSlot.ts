/**
 * Poll the cluster's current processed slot. Used as a liveness signal
 * in the footer — if the number keeps climbing, the RPC is reachable
 * and finalizing blocks.
 *
 * 3s cadence is fine: Solana's slot time is ~400ms so we'll miss
 * intermediate slots, but the footer is a trust indicator, not a
 * real-time counter.
 */

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";

export function useSlot() {
  const { connection } = useConnection();
  return useQuery<number>({
    queryKey: ["slot"],
    refetchInterval: 3_000,
    // No retry back-off spam in dev when the validator is down — once
    // per poll is enough to show the stale state in the UI.
    retry: false,
    queryFn: () => connection.getSlot("processed"),
  });
}
