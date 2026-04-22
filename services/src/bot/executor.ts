/**
 * Liquidation executor — builds + sends the `liquidate` ix.
 *
 * Separated from the scanner so testing / dry-running is clean: the
 * scanner yields `LiquidationCandidate`s, the executor decides what to
 * do with each.
 */

import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Logger } from "pino";
import {
  buildLiquidateIx,
  sendAndConfirm,
  NutrifiEnv,
  Market,
  userLoanPda,
} from "../shared";
import { LiquidationCandidate } from "./evaluator";

export interface ExecutorDeps {
  env: NutrifiEnv;
  connection: Connection;
  wallet: Keypair;
  market: Market;
  marketAddr: PublicKey;
  oracleAddr: PublicKey;
  collateralVault: PublicKey;
  log: Logger;
}

export async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  log: Logger,
): Promise<{ address: PublicKey; createIxs: ReturnType<typeof createAssociatedTokenAccountInstruction>[] }> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    await getAccount(connection, ata);
    return { address: ata, createIxs: [] };
  } catch {
    log.info({ mint: mint.toBase58(), ata: ata.toBase58() }, "creating ATA");
    return {
      address: ata,
      createIxs: [
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          ata,
          owner,
          mint,
        ),
      ],
    };
  }
}

export async function getUsdcBalance(
  connection: Connection,
  owner: PublicKey,
  debtMint: PublicKey,
): Promise<BN> {
  const ata = getAssociatedTokenAddressSync(debtMint, owner);
  try {
    const acct = await getAccount(connection, ata);
    return new BN(acct.amount.toString());
  } catch {
    return new BN(0);
  }
}

export async function executeLiquidation(
  deps: ExecutorDeps,
  candidate: LiquidationCandidate,
  repayAmount: BN,
  dryRun: boolean,
): Promise<string | null> {
  const { env, connection, wallet, market, marketAddr, oracleAddr, collateralVault, log } = deps;

  const childLog = log.child({
    borrower: candidate.address.toBase58(),
    repay: repayAmount.toString(),
  });

  if (repayAmount.isZero()) {
    childLog.info("repay amount is zero — skipping");
    return null;
  }

  if (dryRun) {
    childLog.info(
      {
        health: {
          debt: candidate.health.nominalDebt.toString(),
          ceiling: candidate.health.liquidationCeiling.toString(),
          ratioBps: candidate.health.debtToCeilingBps.toString(),
        },
      },
      "[dry-run] would liquidate",
    );
    return null;
  }

  // Ensure the liquidator has ATAs for both tokens. USDC must already be
  // funded (the bot needs inventory); collateral ATA we'll create if
  // missing so the seize transfer has a destination.
  const debtAta = await ensureAta(
    connection,
    wallet,
    env.debtMint,
    wallet.publicKey,
    childLog,
  );
  const collateralAta = await ensureAta(
    connection,
    wallet,
    env.collateralMint,
    wallet.publicKey,
    childLog,
  );

  const borrower = candidate.loan.owner;
  const userLoan = userLoanPda(env.lendingProgramId, borrower);

  const ix = buildLiquidateIx(
    {
      programId: env.lendingProgramId,
      liquidator: wallet.publicKey,
      market: marketAddr,
      borrower,
      userLoan,
      oracle: oracleAddr,
      collateralMint: env.collateralMint,
      debtMint: env.debtMint,
      collateralVault,
      liquidatorDebtAccount: debtAta.address,
      liquidatorCollateralAccount: collateralAta.address,
    },
    repayAmount,
  );

  return await sendAndConfirm(
    connection,
    wallet,
    [...debtAta.createIxs, ...collateralAta.createIxs, ix],
    childLog,
    {
      computeUnits: 300_000,
      priorityFeeMicroLamports: 5_000,
    },
  );
}

// Re-export so the market bump unused-import lint doesn't complain.
export type { Market };
