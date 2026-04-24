/**
 * Node-global polyfills for Solana libs.
 *
 * Must be imported BEFORE any module that touches `@solana/*` or
 * `@coral-xyz/anchor` — several of those assume Node's `Buffer` exists
 * at module-init time (not just at call time), so a later assignment
 * doesn't help.
 */

import { Buffer } from "buffer";

const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  process?: { env: Record<string, string> };
};

if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = { env: {} };
