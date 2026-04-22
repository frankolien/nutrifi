/**
 * NutriFi lending — end-to-end integration tests.
 *
 * Scenarios:
 *   1. initialize_oracle + initialize_market (admin bootstrap)
 *   2. deposit_collateral + borrow (happy path)
 *   3. withdraw rejected when LTV would break
 *   4. partial repay reduces debt
 *   5. oracle price drops → account liquidatable
 *   6. liquidator repays, seizes collateral with bonus
 *   7. admin guards (pause, unauthorized)
 *
 * The lending program uses the **nSOL** mint from the staking program as
 * collateral. To keep tests hermetic we just create a fresh nSOL mint here
 * rather than threading through the staking init — the two programs are
 * decoupled at runtime; lending only cares that the mint exists.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { assert } from "chai";

import { NutrifiLending } from "../target/types/nutrifi_lending";

const MARKET_SEED = Buffer.from("market");
const COLLATERAL_VAULT_SEED = Buffer.from("collat-vault");
const USDC_MINT_AUTH_SEED = Buffer.from("usdc-mint-auth");
const USER_LOAN_SEED = Buffer.from("user-loan");
const ORACLE_SEED = Buffer.from("oracle");

// Scales (mirror the on-chain constants).
const PRICE_PRECISION = new BN(1_000_000);
const BPS = 10_000;

describe("nutrifi-lending", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NutrifiLending as Program<NutrifiLending>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const [marketPda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED],
    program.programId,
  );
  const [collateralVaultPda] = PublicKey.findProgramAddressSync(
    [COLLATERAL_VAULT_SEED],
    program.programId,
  );
  const [usdcMintAuthPda] = PublicKey.findProgramAddressSync(
    [USDC_MINT_AUTH_SEED],
    program.programId,
  );

  let nsolMint: PublicKey;
  let usdcMint: PublicKey;
  let oraclePda: PublicKey;

  const alice = Keypair.generate(); // borrower
  const eve = Keypair.generate(); // liquidator

  // Initial oracle price: 1 nSOL-lamport == 0.0002 USDC-lamport.
  // With 9-decimal nSOL and 6-decimal USDC, this means 1 nSOL ≈ 200 USDC
  // (since 1e9 nsol-lamports × 2e-4 usdc-lamports = 2e5 usdc-lamports = 200 USDC).
  const INITIAL_PRICE = new BN(200); // 200 / PRICE_PRECISION = 2e-4

  // Market params: 75% LTV, 80% liq threshold, 5% bonus, 50% close factor,
  // 5% APR — close to Aave nSOL.
  const PARAMS = {
    borrowAprBps: new BN(500),
    loanToValueBps: new BN(7_500),
    liquidationThresholdBps: new BN(8_000),
    liquidationBonusBps: new BN(500),
    closeFactorBps: new BN(5_000),
  };

  before("airdrop + mints + ATAs", async () => {
    for (const kp of [alice, eve]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        100 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    nsolMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      9,
    );
    usdcMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
    );
    // USDC mint authority must be the PDA before `initialize_market` runs.
    await setAuthority(
      provider.connection,
      payer,
      usdcMint,
      payer,
      AuthorityType.MintTokens,
      usdcMintAuthPda,
    );

    [oraclePda] = PublicKey.findProgramAddressSync(
      [ORACLE_SEED, nsolMint.toBuffer()],
      program.programId,
    );

    // Give Alice some nSOL (stand-in for having staked).
    const aliceNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      alice.publicKey,
    );
    await mintTo(
      provider.connection,
      payer,
      nsolMint,
      aliceNsol.address,
      payer,
      100_000_000_000n, // 100 nSOL
    );

    // Eve needs USDC to be able to liquidate. We pre-mint by temporarily
    // leaving the USDC mint under payer authority — wait, it's already
    // been transferred. So instead we let the program mint to her via a
    // borrow, or use the helper below: because the authority is now a
    // PDA, we can't mint directly. Solution: mint before the authority
    // transfer happened above. Re-order required? No — we'll have Eve
    // borrow during the test after she deposits her own collateral.
  });

  it("initialize_oracle", async () => {
    await program.methods
      .initializeOracle(INITIAL_PRICE, new BN(300))
      .accountsStrict({
        authority: payer.publicKey,
        collateralMint: nsolMint,
        oracle: oraclePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const oracle = await program.account.mockOracle.fetch(oraclePda);
    assert.isTrue(oracle.price.eq(INITIAL_PRICE));
    assert.strictEqual(oracle.maxStalenessSeconds.toNumber(), 300);
  });

  it("initialize_market", async () => {
    await program.methods
      .initializeMarket(PARAMS)
      .accountsStrict({
        authority: payer.publicKey,
        market: marketPda,
        collateralMint: nsolMint,
        debtMint: usdcMint,
        oracle: oraclePda,
        usdcMintAuthority: usdcMintAuthPda,
        collateralVault: collateralVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const m = await program.account.market.fetch(marketPda);
    assert.strictEqual(m.collateralMint.toBase58(), nsolMint.toBase58());
    assert.strictEqual(m.debtMint.toBase58(), usdcMint.toBase58());
    assert.isTrue(m.loanToValueBps.eq(PARAMS.loanToValueBps));
    assert.isTrue(
      m.liquidationThresholdBps.eq(PARAMS.liquidationThresholdBps),
    );
    assert.isFalse(m.paused);
  });

  async function userLoanPda(owner: PublicKey) {
    const [pda] = PublicKey.findProgramAddressSync(
      [USER_LOAN_SEED, owner.toBuffer()],
      program.programId,
    );
    return pda;
  }

  it("deposit + borrow happy path", async () => {
    const aliceNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      alice.publicKey,
    );
    const aliceUsdc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      alice.publicKey,
    );
    const loanPda = await userLoanPda(alice.publicKey);

    const depositAmount = new BN(10_000_000_000); // 10 nSOL
    await program.methods
      .depositCollateral(depositAmount)
      .accountsStrict({
        user: alice.publicKey,
        market: marketPda,
        userLoan: loanPda,
        collateralMint: nsolMint,
        userCollateralAccount: aliceNsol.address,
        collateralVault: collateralVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    // 10 nSOL × price (200 / 1e6 = 2e-4) × 1e9 lamports = 2_000_000 USDC-lamports = $2.
    // That's collateral *value*. At 75% LTV max borrow is $1.50 = 1_500_000.
    const borrowAmount = new BN(1_000_000); // $1 — well inside LTV
    await program.methods
      .borrow(borrowAmount)
      .accountsStrict({
        user: alice.publicKey,
        market: marketPda,
        userLoan: loanPda,
        owner: alice.publicKey,
        oracle: oraclePda,
        debtMint: usdcMint,
        usdcMintAuthority: usdcMintAuthPda,
        userDebtAccount: aliceUsdc.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    const usdcBal = await getAccount(provider.connection, aliceUsdc.address);
    assert.strictEqual(Number(usdcBal.amount), 1_000_000);

    const loan = await program.account.userLoan.fetch(loanPda);
    assert.strictEqual(loan.collateral.toNumber(), depositAmount.toNumber());
    // scaled_debt starts equal to nominal because index begins at 1.0.
    assert.isTrue(loan.scaledDebt.gt(new BN(0)));
  });

  it("withdraw blocked when it would break LTV", async () => {
    const aliceNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      alice.publicKey,
    );
    const loanPda = await userLoanPda(alice.publicKey);

    // Try to withdraw almost everything — should fail because $1 debt
    // against the remaining collateral would exceed 75% LTV.
    let threw = false;
    try {
      await program.methods
        .withdrawCollateral(new BN(9_900_000_000))
        .accountsStrict({
          user: alice.publicKey,
          market: marketPda,
          userLoan: loanPda,
          owner: alice.publicKey,
          collateralMint: nsolMint,
          oracle: oraclePda,
          userCollateralAccount: aliceNsol.address,
          collateralVault: collateralVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "WithdrawExceedsLtv");
    }
    assert.isTrue(threw, "withdraw should have been rejected");
  });

  it("partial repay reduces debt", async () => {
    const aliceUsdc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      alice.publicKey,
    );
    const loanPda = await userLoanPda(alice.publicKey);
    const before = await program.account.userLoan.fetch(loanPda);

    await program.methods
      .repay(new BN(500_000))
      .accountsStrict({
        user: alice.publicKey,
        market: marketPda,
        userLoan: loanPda,
        owner: alice.publicKey,
        debtMint: usdcMint,
        userDebtAccount: aliceUsdc.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    const after = await program.account.userLoan.fetch(loanPda);
    assert.isTrue(after.scaledDebt.lt(before.scaledDebt));
  });

  it("price drop triggers liquidation", async () => {
    const aliceNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      alice.publicKey,
    );
    const aliceLoan = await userLoanPda(alice.publicKey);

    // Max out Alice's borrow to bring her close to the threshold.
    // Current remaining debt is ~0.5 USDC; collateral value $2 so LTV is
    // fine. Push her up to ~$1.45 total debt (just under 75%).
    const aliceUsdc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      alice.publicKey,
    );
    await program.methods
      .borrow(new BN(900_000))
      .accountsStrict({
        user: alice.publicKey,
        market: marketPda,
        userLoan: aliceLoan,
        owner: alice.publicKey,
        oracle: oraclePda,
        debtMint: usdcMint,
        usdcMintAuthority: usdcMintAuthPda,
        userDebtAccount: aliceUsdc.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    // Crash nSOL: halve the price. Collateral value halves → LTV explodes,
    // account crosses the 80% liquidation threshold.
    await program.methods
      .setPrice(new BN(100))
      .accountsStrict({ authority: payer.publicKey, oracle: oraclePda })
      .rpc();

    // Now Eve (liquidator) needs USDC. Simplest: she deposits her own
    // nSOL and borrows some. Mint her a pile of nSOL first.
    const eveNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      eve.publicKey,
    );
    await mintTo(
      provider.connection,
      payer,
      nsolMint,
      eveNsol.address,
      payer,
      50_000_000_000n,
    );
    const eveLoan = await userLoanPda(eve.publicKey);

    await program.methods
      .depositCollateral(new BN(50_000_000_000))
      .accountsStrict({
        user: eve.publicKey,
        market: marketPda,
        userLoan: eveLoan,
        collateralMint: nsolMint,
        userCollateralAccount: eveNsol.address,
        collateralVault: collateralVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([eve])
      .rpc();

    const eveUsdc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      eve.publicKey,
    );
    await program.methods
      .borrow(new BN(1_000_000))
      .accountsStrict({
        user: eve.publicKey,
        market: marketPda,
        userLoan: eveLoan,
        owner: eve.publicKey,
        oracle: oraclePda,
        debtMint: usdcMint,
        usdcMintAuthority: usdcMintAuthPda,
        userDebtAccount: eveUsdc.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([eve])
      .rpc();

    // Eve liquidates Alice. Close factor = 50%, so repay at most half the debt.
    const aliceLoanBefore = await program.account.userLoan.fetch(aliceLoan);
    const mkt = await program.account.market.fetch(marketPda);
    // nominal debt = scaled * index / INDEX_PRECISION — approximate for test.
    const scaled = BigInt(aliceLoanBefore.scaledDebt.toString());
    const idx = BigInt(mkt.borrowIndex.toString());
    const INDEX_PRECISION = 10n ** 18n;
    const nominal = (scaled * idx) / INDEX_PRECISION;
    const repayAmount = new BN((nominal / 3n).toString()); // well under 50%

    const aliceCollateralBefore = aliceLoanBefore.collateral.toNumber();

    await program.methods
      .liquidate(repayAmount)
      .accountsStrict({
        liquidator: eve.publicKey,
        market: marketPda,
        borrower: alice.publicKey,
        userLoan: aliceLoan,
        oracle: oraclePda,
        collateralMint: nsolMint,
        debtMint: usdcMint,
        collateralVault: collateralVaultPda,
        liquidatorDebtAccount: eveUsdc.address,
        liquidatorCollateralAccount: eveNsol.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([eve])
      .rpc();

    const aliceLoanAfter = await program.account.userLoan.fetch(aliceLoan);
    assert.isBelow(
      aliceLoanAfter.collateral.toNumber(),
      aliceCollateralBefore,
      "alice should have lost collateral",
    );
    assert.isTrue(
      aliceLoanAfter.scaledDebt.lt(aliceLoanBefore.scaledDebt),
      "alice debt should have dropped",
    );

    const eveNsolAfter = await getAccount(
      provider.connection,
      eveNsol.address,
    );
    assert.isAbove(
      Number(eveNsolAfter.amount),
      0,
      "eve should have seized nSOL",
    );
  });

  it("liquidation refused on healthy account", async () => {
    // Restore the price so everyone is healthy again.
    await program.methods
      .setPrice(new BN(400)) // double original -> collateral 2× as valuable
      .accountsStrict({ authority: payer.publicKey, oracle: oraclePda })
      .rpc();

    const aliceLoan = await userLoanPda(alice.publicKey);
    const eveNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      eve.publicKey,
    );
    const eveUsdc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      eve.publicKey,
    );

    let threw = false;
    try {
      await program.methods
        .liquidate(new BN(100_000))
        .accountsStrict({
          liquidator: eve.publicKey,
          market: marketPda,
          borrower: alice.publicKey,
          userLoan: aliceLoan,
          oracle: oraclePda,
          collateralMint: nsolMint,
          debtMint: usdcMint,
          collateralVault: collateralVaultPda,
          liquidatorDebtAccount: eveUsdc.address,
          liquidatorCollateralAccount: eveNsol.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([eve])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "AccountHealthy");
    }
    assert.isTrue(threw, "liquidation should be rejected when healthy");
  });

  it("admin: pause blocks deposits; non-authority rejected", async () => {
    await program.methods
      .setPaused(true)
      .accountsStrict({ authority: payer.publicKey, market: marketPda })
      .rpc();

    const aliceNsol = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      alice.publicKey,
    );
    const loanPda = await userLoanPda(alice.publicKey);
    let threw = false;
    try {
      await program.methods
        .depositCollateral(new BN(1))
        .accountsStrict({
          user: alice.publicKey,
          market: marketPda,
          userLoan: loanPda,
          collateralMint: nsolMint,
          userCollateralAccount: aliceNsol.address,
          collateralVault: collateralVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "MarketPaused");
    }
    assert.isTrue(threw);

    // Non-authority retune attempt.
    threw = false;
    try {
      await program.methods
        .setParams(PARAMS)
        .accountsStrict({ authority: alice.publicKey, market: marketPda })
        .signers([alice])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "non-authority must not retune params");

    // Unpause for any later tests.
    await program.methods
      .setPaused(false)
      .accountsStrict({ authority: payer.publicKey, market: marketPda })
      .rpc();
  });
});
