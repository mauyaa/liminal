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
 * Tests `settle_order_with_oracle`: automated, buyer-confirmation-free
 * settlement triggered by a signed delivery attestation, verified on-chain
 * via Solana's native Ed25519 program + instruction introspection (the
 * standard on-chain signature-verification pattern - see the doc comment on
 * `settle_order_with_oracle` for the exact byte layout, verified against
 * both solana-sdk's and @solana/web3.js's actual source, not assumed).
 *
 * The oracle keypair here stands in for what would be a registered
 * Switchboard TEE enclave's attestation key in production - this program's
 * own verification logic is exactly what would run against a real one; only
 * *which* pubkey is configured as trusted would differ.
 */
describe("liminal oracle settlement (real Ed25519 attestation)", () => {
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
  const DELIVERY_ATTESTATION_TAG = Buffer.from("DELIVERED");

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

  function attestationMessage(order: PublicKey): Buffer {
    return Buffer.concat([order.toBuffer(), DELIVERY_ATTESTATION_TAG]);
  }

  async function initAndFund(marketItemId: number): Promise<PublicKey> {
    const order = orderPda(marketItemId);
    await program.methods
      .initializeListing(new BN(marketItemId), new BN(PRINCIPAL), new BN(3600))
      .accountsPartial({ payer: seller, seller, mint, orderState: order, systemProgram: SystemProgram.programId })
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
    await mintTo(provider.connection, (provider.wallet as any).payer, mint, buyerAta, seller, PRINCIPAL * 5);

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

  it("settles an order given a valid oracle attestation, with no buyer signature at all", async () => {
    const marketItemId = 5001;
    const order = await initAndFund(marketItemId);

    const message = attestationMessage(order);
    const signature = nacl.sign.detached(message, oracle.secretKey);
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message,
      signature,
    });

    const sellerBalanceBefore = (await getAccount(provider.connection, sellerAta)).amount;

    await program.methods
      .settleOrderWithOracle(new BN(marketItemId))
      .accountsPartial({
        payer: provider.wallet.publicKey,
        seller,
        orderState: order,
        mint,
        oracleConfig: oracleConfigPda,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        sellerTokenAccount: sellerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([ed25519Ix])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(Object.keys(orderAccount.status as object)[0], "settled");

    const sellerBalanceAfter = (await getAccount(provider.connection, sellerAta)).amount;
    assert.equal(sellerBalanceAfter - sellerBalanceBefore, BigInt(PRINCIPAL));
  });

  it("rejects an attestation signed by a key other than the configured oracle", async () => {
    const marketItemId = 5002;
    const order = await initAndFund(marketItemId);

    const impostor = Keypair.generate();
    const message = attestationMessage(order);
    const signature = nacl.sign.detached(message, impostor.secretKey);
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: impostor.publicKey.toBytes(),
      message,
      signature,
    });

    try {
      await program.methods
        .settleOrderWithOracle(new BN(marketItemId))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Ix])
        .rpc();
      assert.fail("expected UntrustedOracle error");
    } catch (err) {
      assert.include(String(err), "UntrustedOracle");
    }
  });

  it("rejects a validly-signed attestation for a different order (message substitution)", async () => {
    const marketItemId = 5003;
    const order = await initAndFund(marketItemId);
    const otherOrder = await initAndFund(5004);

    // Real oracle, valid signature - but signed over a DIFFERENT order's message.
    const wrongMessage = attestationMessage(otherOrder);
    const signature = nacl.sign.detached(wrongMessage, oracle.secretKey);
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: wrongMessage,
      signature,
    });

    try {
      await program.methods
        .settleOrderWithOracle(new BN(marketItemId))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
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

  it("rejects settlement with no Ed25519 attestation instruction present at all", async () => {
    const marketItemId = 5005;
    const order = await initAndFund(marketItemId);

    try {
      await program.methods
        .settleOrderWithOracle(new BN(marketItemId))
        .accountsPartial({
          payer: provider.wallet.publicKey,
          seller,
          orderState: order,
          mint,
          oracleConfig: oracleConfigPda,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
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
