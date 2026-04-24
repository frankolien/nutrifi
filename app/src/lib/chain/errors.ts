/**
 * Translate on-chain error logs into human UI copy.
 *
 * Anchor writes `AnchorError occurred. Error Code: <Name>. Error Number: <N>.`
 * when a `require!` / `@ Error::Foo` check fails. We look for the known code
 * names and return a short, user-facing sentence. Falls back to the original
 * text when nothing matches.
 *
 * Mirrors programs/lending/src/errors.rs — keep in lockstep.
 */

const FRIENDLY: Record<string, string> = {
  ZeroAmount: "Enter an amount greater than zero.",
  MathOverflow: "Amount too large — try a smaller number.",
  MarketPaused: "The market is paused. Try again later.",
  Unauthorized: "You're not allowed to perform this action.",
  MintMismatch: "Token mismatch — refresh the page.",
  VaultMismatch: "Vault mismatch — refresh the page.",
  OracleMismatch: "Oracle mismatch — refresh the page.",
  OracleStale:
    "Oracle price is stale. Refresh it (yarn push-price 150) and try again.",
  OraclePriceTooHigh: "Oracle price is out of range.",
  InsufficientCollateral: "You don't have enough collateral deposited.",
  InsufficientDebt: "You have no debt to repay.",
  BorrowExceedsLtv:
    "This borrow would exceed the 75% loan-to-value cap. Deposit more collateral or borrow less.",
  WithdrawExceedsLtv:
    "Withdrawing this much would leave your position unsafe. Repay some debt first.",
  AccountHealthy:
    "This account isn't liquidatable — its health factor is still above 1.0×.",
  CloseFactorExceeded:
    "A liquidation can only repay up to 50% of the outstanding debt at once.",
  SeizeExceedsCollateral:
    "Liquidator would seize more collateral than the borrower has posted.",
  SelfLiquidation: "A borrower cannot liquidate their own position.",
  ThresholdBelowLtv:
    "Liquidation threshold must be higher than the loan-to-value ratio.",
  RatioTooHigh: "Risk parameter exceeds 100%.",
  AprTooHigh: "Borrow APR is above the protocol ceiling.",
};

const USER_REJECTED = [
  "User rejected",
  "User denied",
  "Transaction was not confirmed",
];

export function humanizeError(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
      ? raw.message
      : JSON.stringify(raw);

  if (USER_REJECTED.some((s) => text.includes(s))) {
    return "You cancelled the transaction in your wallet.";
  }

  // `AnchorError occurred. Error Code: BorrowExceedsLtv. Error Number: 6014.`
  const anchor = text.match(/Error Code:\s*(\w+)/);
  if (anchor) {
    const name = anchor[1];
    if (FRIENDLY[name]) return FRIENDLY[name];
    // Unknown code — surface the camelcase name cleanly.
    return name
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  }

  // Program log: `AnchorError caused by account: user_loan. Error Code: ...`
  // handled by the regex above.

  // Known non-Anchor signals.
  if (text.includes("insufficient funds")) {
    return "Wallet has insufficient SOL to pay transaction fees.";
  }
  if (text.includes("custom program error: 0x0")) {
    return "Account already initialized — refresh the page.";
  }
  if (text.includes("blockhash")) {
    return "Transaction expired — try again.";
  }

  // Fallback: first line, trimmed.
  return text.split("\n")[0].slice(0, 200);
}
