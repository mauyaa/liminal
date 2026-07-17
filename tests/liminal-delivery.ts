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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tests the optimistic delivery-signal flow: `signal_delivery` (opens a
 * challenge window via the same Ed25519-attestation pattern
 * `settle_order_with_oracle` uses, just a differently-tagged message that
 * also binds the caller-chosen challenge window so it can't be swapped out
 * from under the oracle's signature), `confirm_delivery` (buyer releases
 * early), `challenge_order` (buyer disputes before the window closes), and
 * `finalize_delivery` (permissionless settlement once the window has passed
 * unchallenged).
 */
describe("liminal delivery-signal / challenge-window flow", () => {
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

  function signalMessage(order: PublicKey, windowSecs: number): Buffer {
    return Buffer.concat([
      order.toBuffer(),
      new BN(windowSecs).toArrayLike(Buffer, "le", 8),
      DELIVERY_SIGNAL_TAG,
    ]);
  }

  function signalIx(order: PublicKey, windowSecs: number, signer: Keypair = oracle) {
    const message = signalMessage(order, windowSecs);
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

  async function signalDelivery(
    marketItemId: number,
    order: PublicKey,
    windowSecs: number,
    signer: Keypair = oracle
  ) {
    await program.methods
      .signalDelivery(new BN(marketItemId), new BN(windowSecs))
      .accountsPartial({
        payer: provider.wallet.publicKey,
        seller,
        orderState: order,
        oracleConfig: oracleConfigPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([signalIx(order, windowSecs, signer)])
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
    await mintTo(provider.connection, (provider.wallet as any).payer, mint, buyerAta, seller, PRINCIPAL * 12);

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

  it("signal_delivery opens the challenge window given a valid attestation", async () => {
    const marketItemId = 6001;
    const order = await initAndFund(marketItemId);

    await signalDelivery(marketItemId, order, 3600);

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "deliverySignaled");
    assert.isAbove(orderAccount.challengeDeadline.toNumber(), 0);
  });

  it("confirm_delivery lets the buyer release early right after signaling", async () => {
    const marketItemId = 6002;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 3600);

    const sellerBalanceBefore = (await getAccount(provider.connection, sellerAta)).amount;

    await program.methods
      .confirmDelivery(new BN(marketItemId))
      .accountsPartial({
        buyer: buyer.publicKey,
        seller,
        orderState: order,
        mint,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        sellerTokenAccount: sellerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "settled");

    const sellerBalanceAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(sellerBalanceAfter - sellerBalanceBefore, BigInt(PRINCIPAL));
  });

  it("challenge_order disputes a signaled delivery before the window closes", async () => {
    const marketItemId = 6003;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 3600);

    await program.methods
      .challengeOrder(new BN(marketItemId))
      .accountsPartial({ buyer: buyer.publicKey, seller, orderState: order })
      .signers([buyer])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "disputed");

    // finalize_delivery must now correctly reject - no longer DeliverySignaled.
    try {
      await program.methods
        .finalizeDelivery(new BN(marketItemId))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("expected InvalidState error");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }
  });

  it("finalize_delivery settles the order once the challenge window has actually elapsed", async () => {
    const marketItemId = 6004;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 2); // 2 second window

    await sleep(3000);

    const sellerBalanceBefore = (await getAccount(provider.connection, sellerAta)).amount;

    // Called by the buyer here purely to show it's permissionless.
    await program.methods
      .finalizeDelivery(new BN(marketItemId))
      .accountsPartial({
        payer: buyer.publicKey,
        seller,
        orderState: order,
        mint,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        sellerTokenAccount: sellerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "settled");

    const sellerBalanceAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(sellerBalanceAfter - sellerBalanceBefore, BigInt(PRINCIPAL));
  });

  it("rejects challenge_order once the challenge window has closed", async () => {
    const marketItemId = 6005;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 2); // 2 second window

    await sleep(3000);

    try {
      await program.methods
        .challengeOrder(new BN(marketItemId))
        .accountsPartial({ buyer: buyer.publicKey, seller, orderState: order })
        .signers([buyer])
        .rpc();
      assert.fail("expected ChallengeWindowExpired error");
    } catch (err) {
      assert.include(String(err), "ChallengeWindowExpired");
    }
  });

  it("rejects signal_delivery signed by a key other than the configured oracle", async () => {
    const marketItemId = 6006;
    const order = await initAndFund(marketItemId);
    const impostor = Keypair.generate();

    try {
      await signalDelivery(marketItemId, order, 3600, impostor);
      assert.fail("expected UntrustedOracle error");
    } catch (err) {
      assert.include(String(err), "UntrustedOracle");
    }
  });

  it("rejects a validly-signed signal_delivery attestation for a different order", async () => {
    const marketItemId = 6007;
    const order = await initAndFund(marketItemId);
    const otherOrder = await initAndFund(6008);

    const wrongMessage = signalMessage(otherOrder, 3600);
    const signature = nacl.sign.detached(wrongMessage, oracle.secretKey);
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: wrongMessage,
      signature,
    });

    try {
      await program.methods
        .signalDelivery(new BN(marketItemId), new BN(3600))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          oracleConfig: oracleConfigPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Ix])
        .rpc();
      assert.fail("expected InvalidOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "InvalidOracleAttestation");
    }
  });

  it("rejects a valid attestation replayed alongside a different challenge window than was signed", async () => {
    const marketItemId = 6009;
    const order = await initAndFund(marketItemId);

    // Oracle genuinely signs a 3600s window for this exact order...
    const ed25519Ix = signalIx(order, 3600);

    // ...but the instruction call claims a much shorter window - the signed
    // message won't match, since challenge_window_secs is bound into it.
    try {
      await program.methods
        .signalDelivery(new BN(marketItemId), new BN(2))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          oracleConfig: oracleConfigPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Ix])
        .rpc();
      assert.fail("expected InvalidOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "InvalidOracleAttestation");
    }
  });

  it("rejects signal_delivery with no Ed25519 attestation instruction present", async () => {
    const marketItemId = 6010;
    const order = await initAndFund(marketItemId);

    try {
      await program.methods
        .signalDelivery(new BN(marketItemId), new BN(3600))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          oracleConfig: oracleConfigPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .rpc();
      assert.fail("expected MissingOracleAttestation error");
    } catch (err) {
      assert.include(String(err), "MissingOracleAttestation");
    }
  });

  it("rejects finalize_delivery before the challenge window elapses", async () => {
    const marketItemId = 6011;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 3600);

    try {
      await program.methods
        .finalizeDelivery(new BN(marketItemId))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("expected ChallengeWindowNotElapsed error");
    } catch (err) {
      assert.include(String(err), "ChallengeWindowNotElapsed");
    }
  });

  it("rejects challenge_order and confirm_delivery from a non-buyer", async () => {
    const marketItemId = 6012;
    const order = await initAndFund(marketItemId);
    await signalDelivery(marketItemId, order, 3600);
    const impostor = Keypair.generate();

    try {
      await program.methods
        .challengeOrder(new BN(marketItemId))
        .accountsPartial({ buyer: impostor.publicKey, seller, orderState: order })
        .signers([impostor])
        .rpc();
      assert.fail("expected InvalidState error (wrong buyer)");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }

    try {
      await program.methods
        .confirmDelivery(new BN(marketItemId))
        .accountsPartial({
          buyer: impostor.publicKey,
          seller,
          orderState: order,
          mint,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([impostor])
        .rpc();
      assert.fail("expected InvalidState error (wrong buyer)");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }
  });
});
