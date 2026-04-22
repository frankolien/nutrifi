/**
 * Loan scanner.
 *
 * `getProgramAccounts` with a `memcmp` filter on the Anchor
 * discriminator returns every `UserLoan` in the lending program. We
 * decode them in-process; no server-side filtering by health, so the
 * caller must handle the empty-but-rented account case.
 *
 * On production clusters this call is slow and rate-limited. For a real
 * deployment you'd replace it with:
 *   - a subscription via `accountSubscribe` / `onProgramAccountChange`,
 *   - or an indexer (Helius, Triton) keyed by the UserLoan
 *     discriminator.
 *
 * For tutorial scale (dozens of loans), periodic `getProgramAccounts`
 * is fine.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  decodeUserLoan,
  decodeMarket,
  decodeMockOracle,
  USER_LOAN_DISCRIMINATOR,
  UserLoan,
  Market,
  MockOracle,
} from "../shared/decode";

export interface LoanRecord {
  address: PublicKey;
  loan: UserLoan;
}

export async function loadMarket(
  connection: Connection,
  marketAddr: PublicKey,
): Promise<Market> {
  const acct = await connection.getAccountInfo(marketAddr);
  if (!acct) throw new Error(`market account not found at ${marketAddr}`);
  return decodeMarket(acct.data);
}

export async function loadOracle(
  connection: Connection,
  oracleAddr: PublicKey,
): Promise<MockOracle> {
  const acct = await connection.getAccountInfo(oracleAddr);
  if (!acct) throw new Error(`oracle account not found at ${oracleAddr}`);
  return decodeMockOracle(acct.data);
}

export async function scanUserLoans(
  connection: Connection,
  lendingProgramId: PublicKey,
): Promise<LoanRecord[]> {
  const accts = await connection.getProgramAccounts(lendingProgramId, {
    commitment: connection.commitment,
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: base58(USER_LOAN_DISCRIMINATOR),
        },
      },
    ],
  });
  return accts.map((a) => ({
    address: a.pubkey,
    loan: decodeUserLoan(a.account.data),
  }));
}

/** Minimal base58 encoder avoiding a new dep — @solana/web3.js exposes bs58 transitively but isn't re-exported. */
function base58(buf: Buffer): string {
  // We lean on `PublicKey.toBase58()` indirectly: pad to 32, encode, slice.
  // Simpler: hand-roll. UserLoan discriminator is 8 bytes — a trivial case.
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits: number[] = [0];
  for (let i = 0; i < buf.length; i++) {
    let carry = buf[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zeros.
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  return "1".repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join("");
}
