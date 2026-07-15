import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { Liminal } from "../target/types/liminal";

const VAULT_SEED = Buffer.from("liminal-vault");
const VAULT_TOKEN_SEED = Buffer.from("liminal-vault-token");
const ORDER_SEED = Buffer.from("order-state");

function marketItemIdBytes(id: number): Buffer {
  return new BN(id).toArrayLike(Buffer, "le", 8);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("liminal escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.liminal as Program<Liminal>;

  const seller = provider.wallet.publicKey;
  const buyer = Keypair.generate();
  const strangerBuyer = Keypair.generate();

  let mint: PublicKey;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultTokenPda: PublicKey;
  let buyerAta: PublicKey;
  let sellerAta: PublicKey;

  const PRINCIPAL = 1_000_000; // 1 USDC at 6 decimals

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyer.publicKey, 2e9)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(strangerBuyer.publicKey, 2e9)
    );

    mint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      seller,
      null,
      6
    );

    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, mint.toBuffer()],
      program.programId
    );
    [vaultTokenPda] = PublicKey.findProgramAddressSync(
      [VAULT_TOKEN_SEED, mint.toBuffer()],
      program.programId
    );

    buyerAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as any).payer,
        mint,
        buyer.publicKey
      )
    ).address;
    sellerAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as any).payer,
        mint,
        seller
      )
    ).address;

    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      buyerAta,
      seller,
      PRINCIPAL * 10
    );

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
  });

  function orderPda(marketItemId: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [ORDER_SEED, seller.toBuffer(), marketItemIdBytes(marketItemId)],
      program.programId
    )[0];
  }

  async function initListing(marketItemId: number, deliveryWindowSecs: number) {
    const order = orderPda(marketItemId);
    await program.methods
      .initializeListing(new BN(marketItemId), new BN(PRINCIPAL), new BN(deliveryWindowSecs))
      .accountsPartial({
        seller,
        mint,
        orderState: order,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return order;
  }

  async function fund(marketItemId: number, order: PublicKey, buyerKeypair: Keypair) {
    await program.methods
      .fundOrder(new BN(marketItemId))
      .accountsPartial({
        buyer: buyerKeypair.publicKey,
        seller,
        orderState: order,
        mint,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        buyerTokenAccount: buyerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();
  }

  it("rejects a listing with a zero amount", async () => {
    const marketItemId = 100;
    const order = orderPda(marketItemId);
    try {
      await program.methods
        .initializeListing(new BN(marketItemId), new BN(0), new BN(60))
        .accountsPartial({
          seller,
          mint,
          orderState: order,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("expected InvalidListingParams error");
    } catch (err) {
      assert.include(String(err), "InvalidListingParams");
    }
  });

  it("runs the full funded -> settled lifecycle", async () => {
    const marketItemId = 1;
    const order = await initListing(marketItemId, 3600);

    await fund(marketItemId, order, buyer);

    let orderAccount = await program.account.orderState.fetch(order);
    assert.equal(orderAccount.status.funded !== undefined, true);
    assert.equal(orderAccount.buyer.toBase58(), buyer.publicKey.toBase58());

    let vaultTokenBalance = await getAccount(provider.connection, vaultTokenPda);
    assert.equal(vaultTokenBalance.amount.toString(), PRINCIPAL.toString());

    await program.methods
      .settleOrder(new BN(marketItemId))
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

    orderAccount = await program.account.orderState.fetch(order);
    assert.equal(orderAccount.status.settled !== undefined, true);

    const sellerBalance = await getAccount(provider.connection, sellerAta);
    assert.equal(sellerBalance.amount.toString(), PRINCIPAL.toString());

    vaultTokenBalance = await getAccount(provider.connection, vaultTokenPda);
    assert.equal(vaultTokenBalance.amount.toString(), "0");

    const vaultAccount = await program.account.unifiedVault.fetch(vaultPda);
    assert.equal(vaultAccount.totalActivePrincipal.toString(), "0");
  });

  it("rejects settling the same order twice", async () => {
    const marketItemId = 1; // already settled above
    const order = orderPda(marketItemId);
    try {
      await program.methods
        .settleOrder(new BN(marketItemId))
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
      assert.fail("expected InvalidState error");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }
  });

  it("rejects settlement signed by someone other than the recorded buyer", async () => {
    const marketItemId = 2;
    const order = await initListing(marketItemId, 3600);
    await fund(marketItemId, order, buyer);

    try {
      await program.methods
        .settleOrder(new BN(marketItemId))
        .accountsPartial({
          buyer: strangerBuyer.publicKey,
          seller,
          orderState: order,
          mint,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          sellerTokenAccount: sellerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([strangerBuyer])
        .rpc();
      assert.fail("expected a has_one constraint failure");
    } catch (err) {
      assert.include(String(err), "InvalidState");
    }
  });

  it("rejects a refund before the delivery deadline passes", async () => {
    const marketItemId = 2; // funded above, still within its 3600s window
    const order = orderPda(marketItemId);
    try {
      await program.methods
        .refundOrder(new BN(marketItemId))
        .accountsPartial({
          payer: seller,
          seller,
          orderState: order,
          mint,
          unifiedVault: vaultPda,
          vaultTokenAccount: vaultTokenPda,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("expected DeadlineNotReached error");
    } catch (err) {
      assert.include(String(err), "DeadlineNotReached");
    }
  });

  it("allows a permissionless timeout refund once the deadline passes", async () => {
    const marketItemId = 3;
    const order = await initListing(marketItemId, 2); // 2 second window
    await fund(marketItemId, order, buyer);

    await sleep(3000);

    const buyerBalanceBefore = await getAccount(provider.connection, buyerAta);

    // Called by the seller here purely to show it's permissionless -
    // nothing in the instruction requires payer to be buyer or seller.
    await program.methods
      .refundOrder(new BN(marketItemId))
      .accountsPartial({
        payer: seller,
        seller,
        orderState: order,
        mint,
        unifiedVault: vaultPda,
        vaultTokenAccount: vaultTokenPda,
        buyerTokenAccount: buyerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(orderAccount.status.refunded !== undefined, true);

    const buyerBalanceAfter = await getAccount(provider.connection, buyerAta);
    assert.equal(
      (buyerBalanceAfter.amount - buyerBalanceBefore.amount).toString(),
      PRINCIPAL.toString()
    );
  });
});
