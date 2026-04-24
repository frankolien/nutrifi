/**
 * Dev-only keypair signer. Lets you sign + send transactions without
 * a browser wallet — useful on localnet where Phantom/Solflare can't
 * talk to http://127.0.0.1:8899.
 *
 * **Never ship this to production.** The keypair is loaded from a Vite
 * env var at dev-server startup; there's no way to inject one into a
 * built bundle unless someone sets it at build time (don't).
 *
 * Usage: set `VITE_DEV_SIGNER_SECRET` to the JSON-array secret key in
 * `.env.local` (gitignored). The NutriFi `app/.env.local` template is
 * created by the setup script.
 */

import { Keypair } from "@solana/web3.js";

function parseSecret(raw: string): Uint8Array {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error("not an array");
    return Uint8Array.from(arr);
  } catch {
    throw new Error(
      "VITE_DEV_SIGNER_SECRET must be a JSON array of bytes (same format as solana-keygen output).",
    );
  }
}

export function loadDevKeypair(): Keypair | null {
  const raw = import.meta.env.VITE_DEV_SIGNER_SECRET;
  if (!raw) return null;
  return Keypair.fromSecretKey(parseSecret(raw));
}
