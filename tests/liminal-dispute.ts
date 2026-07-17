import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import nacl from "tweetnacl";
import { Liminal } from "../target/types/liminal";

/**
 * Tests `resolve_dispute`: an oracle-attested verdict that splits a
 * `Disputed` order's principal between buyer and seller by `seller_bps`,
 * reusing the same Ed25519-attestation pattern as `settle_order_with_oracle`
 * and `signal_delivery` with its own message tag (order + seller_bps +
 * verdict_hash + RESOLVE_DISPUTE_TAG) so a verdict can't be replayed as
 * either of those, and neither can the split or hash be swapped out
 * independently of the oracle's actual signature.
 */
describe("liminal dispute resolution", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.liminal as Program<Liminal>;

  const seller = provider.wallet.publicKey;
  const buyer = Keypair.generate();
  const oracle = Keypair.generate();

  const VAULT_SEED = Buffer.from("liminal-vault");
  const VAULT_TOKEN_SEED = Buffer.from("liminal-vault-token");
  const ORDER_SEED = Buffer.from("order-state");
  const ORACLE_CONFIG_SEED = Buffer.from("oracle-config");
  const DELIVERY_SIGNAL_TAG = Buffer.from("LIMINAL:DELIVERY:v1");
  const RESOLVE_DISPUTE_TAG = Buffer.from("LIMINAL:RESOLVE:v1");
  const VERDICT_HASH = Buffer.alloc(32, 7); // stand-in for a real sha256 of the verdict reasoning

  let mint: PublicKey;
  let vaultPda: PublicKey;
  let vaultTokenPda: PublicKey;
  let oracleConfigPda: PublicKey;
  let buyerAta: PublicKey;
  let sellerAta: PublicKey;

  const PRINCIPAL = 2_000_000;

  function marketItemIdBytes(id: number): Buffer {
    return new BN(id).toArrayLike(Buffer, "le", 8);
  }

  function orderPda(marketItemId: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [ORDER_SEED, seller.toBuffer(), marketItemIdBytes(marketItemId)],
      program.programId
    )[0];
  }

  function resolveMessage(order: PublicKey, sellerBps: number, verdictHash: Buffer): Buffer {
    const bpsBytes = Buffer.alloc(2);
    bpsBytes.writeUInt16LE(sellerBps);
    return Buffer.concat([order.toBuffer(), bpsBytes, verdictHash, RESOLVE_DISPUTE_TAG]);
  }

  function resolveIx(order: PublicKey, sellerBps: number, verdictHash: Buffer, signer: Keypair = oracle) {
    const message = resolveMessage(order, sellerBps, verdictHash);
    const signature = nacl.sign.detached(message, signer.secretKey);
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: signer.publicKey.toBytes(),
      message,
      signature,
    });
  }

  async function initAndFund(marketItemId: number): Promise<PublicKey> {
    const order = orderPda(marketItemId);
    await program.methods
      .initializeListing(new BN(marketItemId), new BN(PRINCIPAL), new BN(3600))
      .accountsPartial({ seller, mint, orderState: order, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods
      .fundOrder(new BN(marketItemId))
      .accountsPartial({
        buyer: buyer.publicKey,
        seller,
        orderState: order,
        mint,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        buyerTokenAccount: buyerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    return order;
  }

  /** fund -> signal_delivery -> buyer challenges -> Disputed. */
  async function disputedOrder(marketItemId: number): Promise<PublicKey> {
    const order = await initAndFund(marketItemId);

    const windowSecs = 3600;
    const signalMessage = Buffer.concat([
      order.toBuffer(),
      new BN(windowSecs).toArrayLike(Buffer, "le", 8),
      DELIVERY_SIGNAL_TAG,
    ]);
    const signalSignature = nacl.sign.detached(signalMessage, oracle.secretKey);
    const signalEd25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: signalMessage,
      signature: signalSignature,
    });
    await program.methods
      .signalDelivery(new BN(marketItemId), new BN(windowSecs))
      .accountsPartial({
        payer: seller,
        seller,
        orderState: order,
        oracleConfig: oracleConfigPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([signalEd25519Ix])
      .rpc();

    await program.methods
      .challengeOrder(new BN(marketItemId))
      .accountsPartial({ buyer: buyer.publicKey, seller, orderState: order })
      .signers([buyer])
      .rpc();

    return order;
  }

  async function resolve(
    marketItemId: number,
    order: PublicKey,
    sellerBps: number,
    verdictHash: Buffer = VERDICT_HASH,
    signer: Keypair = oracle
  ) {
    return program.methods
      .resolveDispute(new BN(marketItemId), sellerBps, Array.from(verdictHash))
      .accountsPartial({
        payer: provider.wallet.publicKey,
        seller,
        orderState: order,
        mint,
        oracleConfig: oracleConfigPda,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        sellerTokenAccount: sellerAta,
        buyerTokenAccount: buyerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([resolveIx(order, sellerBps, verdictHash, signer)])
      .rpc();
  }

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyer.publicKey, 2e9)
    );

    mint = await createMint(provider.connection, (provider.wallet as any).payer, seller, null, 6);

    [vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED, mint.toBuffer()], program.programId);
    [vaultTokenPda] = PublicKey.findProgramAddressSync([VAULT_TOKEN_SEED, mint.toBuffer()], program.programId);
    [oracleConfigPda] = PublicKey.findProgramAddressSync(
      [ORACLE_CONFIG_SEED, mint.toBuffer()],
      program.programId
    );

    buyerAta = (
      await getOrCreateAssociatedTokenAccount(provider.connection, (provider.wallet as any).payer, mint, buyer.publicKey)
    ).address;
    sellerAta = (
      await getOrCreateAssociatedTokenAccount(provider.connection, (provider.wallet as any).payer, mint, seller)
    ).address;
    await mintTo(provider.connection, (provider.wallet as any).payer, mint, buyerAta, seller, PRINCIPAL * 20);

    await program.methods
      .initializeVault()
      .accountsPartial({
        authority: seller,
        mint,
        unifiedVault: vaultPda,
        tokenVault: vaultTokenPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeOracleConfig(oracle.publicKey)
      .accountsPartial({
        authority: seller,
        mint,
        oracleConfig: oracleConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("resolves a full refund (seller_bps = 0)", async () => {
    const marketItemId = 7001;
    const order = await disputedOrder(marketItemId);

    const buyerBefore = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerBefore = (await getAccount(provider.connection, sellerAta)).amount;

    await resolve(marketItemId, order, 0);

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "resolved");

    const buyerAfter = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(buyerAfter - buyerBefore, BigInt(PRINCIPAL));
    assert.equal(sellerAfter - sellerBefore, BigInt(0));
  });

  it("resolves a full settle (seller_bps = 10000)", async () => {
    const marketItemId = 7002;
    const order = await disputedOrder(marketItemId);

    const buyerBefore = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerBefore = (await getAccount(provider.connection, sellerAta)).amount;

    await resolve(marketItemId, order, 10_000);

    const buyerAfter = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(buyerAfter - buyerBefore, BigInt(0));
    assert.equal(sellerAfter - sellerBefore, BigInt(PRINCIPAL));
  });

  it("resolves a 70/30 split", async () => {
    const marketItemId = 7003;
    const order = await disputedOrder(marketItemId);

    const buyerBefore = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerBefore = (await getAccount(provider.connection, sellerAta)).amount;

    await resolve(marketItemId, order, 7_000);

    const buyerAfter = (await getAccount(provider.connection, buyerAta)).amount;
    const sellerAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(sellerAfter - sellerBefore, BigInt(Math.floor((PRINCIPAL * 7000) / 10000)));
    assert.equal(buyerAfter - buyerBefore, BigInt(PRINCIPAL - Math.floor((PRINCIPAL * 7000) / 10000)));
  });

  it("rejects a verdict signed by a key other than the configured oracle", async () => {
    const marketItemId = 7004;
    const order = await disputedOrder(marketItemId);
    const impostor = Keypair.generate();

    try {
      await resolve(marketItemId, order, 5_000, VERDICT_HASH, impostor);
      assert.fail("expected UntrustedOracle error");
    } catch (err) {
      assert.include(String(err), "UntrustedOracle");
    }
  });

  it("rejects a resolution whose seller_bps doesn't match what the oracle signed", async () => {
    const marketItemId = 7005;
    const order = await disputedOrder(marketItemId);

    // Oracle genuinely signs a 30% split...
    const ed25519Ix = resolveIx(order, 3_000, VERDICT_HASH);
    // ...but the instruction call claims 100% to the seller.
    try {
      await program.methods
        .resolveDispute(new BN(marketItemId), 10_000, Array.from(VERDICT_HASH))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Ix])
        .rpc();
      assert.fail("expected InvalidOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "InvalidOracleAttestation");
    }
  });

  it("rejects a resolution whose verdict_hash doesn't match what the oracle signed", async () => {
    const marketItemId = 7006;
    const order = await disputedOrder(marketItemId);

    const signedHash = Buffer.alloc(32, 1);
    const suppliedHash = Buffer.alloc(32, 2);
    const ed25519Ix = resolveIx(order, 5_000, signedHash);

    try {
      await program.methods
        .resolveDispute(new BN(marketItemId), 5_000, Array.from(suppliedHash))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Ix])
        .rpc();
      assert.fail("expected InvalidOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "InvalidOracleAttestation");
    }
  });

  it("rejects resolving an order that isn't Disputed", async () => {
    const marketItemId = 7007;
    const order = await initAndFund(marketItemId); // still just Funded, never signaled/challenged

    try {
      await resolve(marketItemId, order, 5_000);
      assert.fail("expected InvalidState error");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }
  });

  it("rejects seller_bps > 10000", async () => {
    const marketItemId = 7008;
    const order = await disputedOrder(marketItemId);

    try {
      await resolve(marketItemId, order, 10_001);
      assert.fail("expected InvalidSplitBps error");
    } catch (err) {
      assert.include(String(err), "InvalidSplitBps");
    }
  });

  it("rejects resolution with no Ed25519 attestation instruction present", async () => {
    const marketItemId = 7009;
    const order = await disputedOrder(marketItemId);

    try {
      await program.methods
        .resolveDispute(new BN(marketItemId), 5_000, Array.from(VERDICT_HASH))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .rpc();
      assert.fail("expected MissingOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "MissingOracleAttestation");
    }
  });
});
