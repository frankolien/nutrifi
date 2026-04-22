/**
 * CoinGecko free-tier price source.
 *
 * Responds with `{ [assetId]: { usd: <number> } }`. We only care about
 * the USD price — convert to the on-chain `u128` format (scaled by
 * `PRICE_PRECISION` per smallest collateral unit) in the caller.
 *
 * The free tier rate-limits to ~10-30 req/min. Don't poll faster than
 * every ~5s if you care about not getting banned.
 */

import { Logger } from "pino";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";

export interface PriceQuote {
  assetId: string;
  usd: number;
  fetchedAt: number; // ms since epoch
}

export async function fetchUsdPrice(
  assetId: string,
  log: Logger,
): Promise<PriceQuote> {
  const url = `${COINGECKO_BASE}?ids=${encodeURIComponent(assetId)}&vs_currencies=usd`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `coingecko ${res.status} ${res.statusText}: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const price = json[assetId]?.usd;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`coingecko returned no price for "${assetId}"`);
  }
  log.debug({ assetId, price }, "fetched coingecko price");
  return { assetId, usd: price, fetchedAt: Date.now() };
}
