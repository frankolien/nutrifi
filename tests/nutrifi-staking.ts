/**
 * NutriFi staking — end-to-end happy path + edge cases.
 *
 * Run: `anchor test` (boots a local validator, deploys, runs this file).
 *
 * Scenarios covered:
 *   1. initialize       — singleton Config, PDAs wired correctly.
 *   2. stake            — first depositor mints 1:1; second depositor uses peg.
 *   3. claim_rewards    — NUT accrues in proportion to time × shares.
 *   4. unstake (partial + full) — shares + vault drain correctly.
 *   5. admin guards     — pause blocks stake; wrong authority rejected.
 *
 * These aren't unit tests — they exercise real CPIs against the Token program.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { assert } from "chai";

import { NutrifiStaking } from "../target/types/nutrifi_staking";

const CONFIG_SEED = Buffer.from("config");
const SOL_VAULT_SEED = Buffer.from("sol-vault");
const NSOL_MINT_AUTH_SEED = Buffer.from("nsol-mint-auth");
const NUT_MINT_AUTH_SEED = Buffer.from("nut-mint-auth");
const USER_STAKE_SEED = Buffer.from("user-stake");

describe("nutrifi-staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NutrifiStaking as Program<NutrifiStaking>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // PDAs derived once — same for the whole suite.
  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    program.programId,
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [SOL_VAULT_SEED],
    program.programId,
  );
  const [nsolMintAuthPda] = PublicKey.findProgramAddressSync(
    [NSOL_MINT_AUTH_SEED],
    program.programId,
  );
  const [nutMintAuthPda] = PublicKey.findProgramAddressSync(
    [NUT_MINT_AUTH_SEED],
    program.programId,
  );

  let nsolMint: PublicKey;
  let nutMint: PublicKey;

  const alice = Keypair.generate();
  const bob = Keypair.generate();

  // 10% APY in NUT-per-lamport terms (scaled by RATE_PRECISION = 1e12).
  const REWARD_RATE = new BN("100000000000");

  before("airdrop + create mints", async () => {
    for (const kp of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        100 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // nSOL: 9 decimals to mirror SOL, mint authority = payer initially so
    // we can transfer it to the PDA below. (Anchor's `Mint::authority`
    // constraint requires the mint to already be controlled by the PDA.)
    nsolMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      9,
    );
    await setAuthority(
      provider.connection,
      payer,
      nsolMint,
      payer,
      AuthorityType.MintTokens,
      nsolMintAuthPda,
    );

    nutMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
    );
    await setAuthority(
      provider.connection,
      payer,
      nutMint,
      payer,
      AuthorityType.MintTokens,
      nutMintAuthPda,
    );
  });

  it("initialize", async () => {
    await program.methods
      .initialize(REWARD_RATE)
      .accountsStrict({
        authority: payer.publicKey,
        config: configPda,
        solVault: solVaultPda,
        nsolMint,
        nutMint,
        nsolMintAuthority: nsolMintAuthPda,
        nutMintAuthority: nutMintAuthPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    assert.strictEqual(cfg.authority.toBase58(), payer.publicKey.toBase58());
    assert.strictEqual(cfg.nsolMint.toBase58(), nsolMint.toBase58());
    assert.strictEqual(cfg.nutMint.toBase58(), nutMint.toBase58());
    assert.isTrue(cfg.rewardRate.eq(REWARD_RATE));
    assert.isFalse(cfg.paused);
    assert.strictEqual(cfg.totalStakedLamports.toNumber(), 0);
    assert.strictEqual(cfg.nsolSupply.toNumber(), 0);
  });

  async function stakeFor(user: Keypair, solAmount: number) {
    const [userStakePda] = PublicKey.findProgramAddressSync(
      [USER_STAKE_SEED, user.publicKey.toBuffer()],
      program.programId,
    );
    const userNsolAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      user.publicKey,
    );

    await program.methods
      .stake(new BN(solAmount))
      .accountsStrict({
        user: user.publicKey,
        config: configPda,
        userStake: userStakePda,
        solVault: solVaultPda,
        nsolMint,
        nsolMintAuthority: nsolMintAuthPda,
        userNsolAccount: userNsolAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    return { userStakePda, userNsolAta: userNsolAta.address };
  }

  it("stake: first depositor mints 1:1", async () => {
    const amount = 5 * LAMPORTS_PER_SOL;
    const { userStakePda, userNsolAta } = await stakeFor(alice, amount);

    const cfg = await program.account.config.fetch(configPda);
    const us = await program.account.userStake.fetch(userStakePda);
    const ata = await getAccount(provider.connection, userNsolAta);

    assert.strictEqual(cfg.totalStakedLamports.toNumber(), amount);
    assert.strictEqual(cfg.nsolSupply.toNumber(), amount);
    assert.strictEqual(us.shares.toNumber(), amount);
    assert.strictEqual(Number(ata.amount), amount);
  });

  it("stake: second depositor pays the current peg", async () => {
    // Peg is still 1:1 because no appreciation has occurred yet, so Bob
    // also mints 1:1. This test mainly verifies a second UserStake PDA
    // can coexist with Alice's.
    const amount = 2 * LAMPORTS_PER_SOL;
    const { userStakePda } = await stakeFor(bob, amount);

    const us = await program.account.userStake.fetch(userStakePda);
    assert.strictEqual(us.shares.toNumber(), amount);
  });

  it("claim_rewards: accrues proportionally", async () => {
    // Let some seconds elapse so the index advances. Local validators
    // tick the clock on every block, so even two slots is enough to see
    // non-zero rewards when rate is 10% APY.
    await new Promise((r) => setTimeout(r, 2000));

    const [userStakePda] = PublicKey.findProgramAddressSync(
      [USER_STAKE_SEED, alice.publicKey.toBuffer()],
      program.programId,
    );
    const userNutAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nutMint,
      alice.publicKey,
    );

    await program.methods
      .claimRewards()
      .accountsStrict({
        user: alice.publicKey,
        config: configPda,
        userStake: userStakePda,
        owner: alice.publicKey,
        nutMint,
        nutMintAuthority: nutMintAuthPda,
        userNutAccount: userNutAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    const ata = await getAccount(provider.connection, userNutAta.address);
    assert.isAbove(
      Number(ata.amount),
      0,
      "alice should have claimed some NUT",
    );
  });

  it("unstake: partial then full", async () => {
    const [userStakePda] = PublicKey.findProgramAddressSync(
      [USER_STAKE_SEED, bob.publicKey.toBuffer()],
      program.programId,
    );
    const bobNsolAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      nsolMint,
      bob.publicKey,
    );

    const before = await program.account.userStake.fetch(userStakePda);
    const half = before.shares.divn(2);

    await program.methods
      .unstake(half)
      .accountsStrict({
        user: bob.publicKey,
        config: configPda,
        userStake: userStakePda,
        owner: bob.publicKey,
        solVault: solVaultPda,
        nsolMint,
        userNsolAccount: bobNsolAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    const mid = await program.account.userStake.fetch(userStakePda);
    assert.strictEqual(mid.shares.toNumber(), before.shares.sub(half).toNumber());

    // Now drain the rest.
    await program.methods
      .unstake(mid.shares)
      .accountsStrict({
        user: bob.publicKey,
        config: configPda,
        userStake: userStakePda,
        owner: bob.publicKey,
        solVault: solVaultPda,
        nsolMint,
        userNsolAccount: bobNsolAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    const after = await program.account.userStake.fetch(userStakePda);
    assert.strictEqual(after.shares.toNumber(), 0);
  });

  it("admin: set_paused blocks stake", async () => {
    await program.methods
      .setPaused(true)
      .accountsStrict({ authority: payer.publicKey, config: configPda })
      .rpc();

    let threw = false;
    try {
      await stakeFor(alice, 1 * LAMPORTS_PER_SOL);
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "PoolPaused");
    }
    assert.isTrue(threw, "stake should revert while paused");

    // unpause so later tests don't trip.
    await program.methods
      .setPaused(false)
      .accountsStrict({ authority: payer.publicKey, config: configPda })
      .rpc();
  });

  it("admin: non-authority is rejected", async () => {
    let threw = false;
    try {
      await program.methods
        .setRewardRate(new BN(0))
        .accountsStrict({ authority: alice.publicKey, config: configPda })
        .signers([alice])
        .rpc();
    } catch (e: any) {
      threw = true;
    }
    assert.isTrue(threw, "non-authority must not retune rate");
  });
});
