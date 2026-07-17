import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import fs from "fs";
import { Liminal } from "../target/types/liminal";

// Real mainnet Kamino Lend addresses (SOL/BTC market's USDC reserve),
// verified against the actual on-chain Reserve account and klend-sdk's
// compiled source before writing any program code - see README.
const KAMINO_PROGRAM = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
const LENDING_MARKET = new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF");
const LENDING_MARKET_AUTHORITY = new PublicKey("9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo");
const RESERVE = new PublicKey("D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59");
const RESERVE_LIQUIDITY_SUPPLY = new PublicKey("Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6");
const RESERVE_COLLATERAL_MINT = new PublicKey("B8V6WVjPxW1UGwVDfxH2d2r8SyT4cqn7dQRK6XneVa7D");
const SCOPE_PRICES = new PublicKey("3t4JZcueEzTbVP6kLxXrL3VpWx45jDer4eqysweBchNH");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const VAULT_SEED = Buffer.from("liminal-vault");
const VAULT_TOKEN_SEED = Buffer.from("liminal-vault-token");
const ORDER_SEED = Buffer.from("order-state");
const ORDER_KTOKEN_SEED = Buffer.from("order-ktoken");
const ROUNDING_TOLERANCE = 10n;

function marketItemIdBytes(id: number): Buffer {
  return new BN(id).toArrayLike(Buffer, "le", 8);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("liminal Kamino yield routing (against real cloned mainnet state)", () => {
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  const mintAuthoritySecret = JSON.parse(
    fs.readFileSync(
      "/mnt/c/Users/USER/AppData/Local/Temp/claude/C--Users-USER-Downloads-liminal/fe8c21c7-008b-43c9-a081-c0e1fd50353e/scratchpad/usdc_mint_authority.json",
      "utf-8"
    )
  );
  const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(mintAuthoritySecret));

  const seller = Keypair.generate();
  const buyer = Keypair.generate();

  const wallet = new anchor.Wallet(seller);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.liminal as Program<Liminal>;

  let sellerAta: PublicKey;
  let buyerAta: PublicKey;

  const PRINCIPAL = 2_000_000; // $2 USDC

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, USDC_MINT.toBuffer()],
    program.programId
  );
  const [vaultTokenPda] = PublicKey.findProgramAddressSync(
    [VAULT_TOKEN_SEED, USDC_MINT.toBuffer()],
    program.programId
  );

  before(async function () {
    this.timeout(60000);
    for (const kp of [seller, buyer, mintAuthority]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 5e9);
      await connection.confirmTransaction(sig, "confirmed");
    }

    sellerAta = (
      await getOrCreateAssociatedTokenAccount(connection, seller, USDC_MINT, seller.publicKey)
    ).address;
    buyerAta = (
      await getOrCreateAssociatedTokenAccount(connection, buyer, USDC_MINT, buyer.publicKey)
    ).address;
    await mintTo(connection, mintAuthority, USDC_MINT, buyerAta, mintAuthority, PRINCIPAL * 10);

    // Idempotent: re-running this suite against the same long-lived cloned
    // validator (avoids an expensive re-clone-from-mainnet each iteration)
    // means the vault may already exist from a prior run.
    const existingVault = await connection.getAccountInfo(vaultPda);
    if (existingVault) {
      console.log("    -> vault already initialized, reusing it");
      return;
    }

    await program.methods
      .initializeVaultYield(
        LENDING_MARKET,
        RESERVE,
        LENDING_MARKET_AUTHORITY,
        RESERVE_LIQUIDITY_SUPPLY,
        RESERVE_COLLATERAL_MINT,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
        SCOPE_PRICES
      )
      .accountsPartial({
        authority: seller.publicKey,
        mint: USDC_MINT,
        unifiedVault: vaultPda,
        tokenVault: vaultTokenPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();
  });

  function orderPda(marketItemId: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [ORDER_SEED, seller.publicKey.toBuffer(), marketItemIdBytes(marketItemId)],
      program.programId
    )[0];
  }

  function orderKtokenPda(marketItemId: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [ORDER_KTOKEN_SEED, seller.publicKey.toBuffer(), marketItemIdBytes(marketItemId)],
      program.programId
    )[0];
  }

  async function initListing(marketItemId: number, deliveryWindowSecs: number) {
    const order = orderPda(marketItemId);
    await program.methods
      .initializeListing(new BN(marketItemId), new BN(PRINCIPAL), new BN(deliveryWindowSecs))
      .accountsPartial({
        payer: seller.publicKey,
        seller: seller.publicKey,
        mint: USDC_MINT,
        orderState: order,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();
    return order;
  }

  function kaminoAccounts(marketItemId: number) {
    return {
      seller: seller.publicKey,
      mint: USDC_MINT,
      unifiedVault: vaultPda,
      vaultTokenAccount: vaultTokenPda,
      orderKtokenAccount: orderKtokenPda(marketItemId),
      kaminoProgram: KAMINO_PROGRAM,
      kaminoReserve: RESERVE,
      kaminoLendingMarket: LENDING_MARKET,
      kaminoLendingMarketAuthority: LENDING_MARKET_AUTHORITY,
      kaminoReserveLiquiditySupply: RESERVE_LIQUIDITY_SUPPLY,
      kaminoReserveCollateralMint: RESERVE_COLLATERAL_MINT,
      kaminoPythOracle: SystemProgram.programId,
      kaminoSwitchboardPriceOracle: SystemProgram.programId,
      kaminoSwitchboardTwapOracle: SystemProgram.programId,
      kaminoScopePrices: SCOPE_PRICES,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  // Timestamp-based so re-running this suite against the same long-lived
  // validator never collides with a previous run's order-state PDAs.
  const fundSettleMarketItemId = Date.now();
  const refundMarketItemId = Date.now() + 1;

  it("routes 75% of a funded order's principal into the real Kamino reserve", async function () {
    this.timeout(60000);
    const marketItemId = fundSettleMarketItemId;
    const order = await initListing(marketItemId, 3600);

    const vaultBalanceBefore = (await getAccount(connection, vaultTokenPda)).amount;

    await program.methods
      .fundOrderYield(new BN(marketItemId))
      .accountsPartial({
        buyer: buyer.publicKey,
        buyerTokenAccount: buyerAta,
        systemProgram: SystemProgram.programId,
        orderState: order,
        ...kaminoAccounts(marketItemId),
      })
      .signers([buyer])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(orderAccount.status.funded !== undefined, true);
    assert.isTrue(orderAccount.kTokenShares.gtn(0), "expected non-zero kToken shares after deposit");

    const kTokenBalance = (await getAccount(connection, orderKtokenPda(marketItemId))).amount;
    assert.equal(kTokenBalance.toString(), orderAccount.kTokenShares.toString());

    const vaultBalanceAfter = (await getAccount(connection, vaultTokenPda)).amount;
    const expectedBuffer = BigInt(PRINCIPAL) - (BigInt(PRINCIPAL) * 7500n) / 10000n;
    const actualBuffer = vaultBalanceAfter - vaultBalanceBefore;
    const bufferDelta = actualBuffer > expectedBuffer ? actualBuffer - expectedBuffer : expectedBuffer - actualBuffer;
    assert.isTrue(
      bufferDelta <= 2n,
      `vault_token_account should hold ~25% buffer (expected ${expectedBuffer}, got ${actualBuffer})`
    );

    console.log(
      `    -> deposited ${((BigInt(PRINCIPAL) * 7500n) / 10000n).toString()} liquidity units, received ${kTokenBalance.toString()} kTokens`
    );
  });

  it("redeems kTokens and pays the seller principal + any accrued yield on settle", async function () {
    this.timeout(60000);
    const marketItemId = fundSettleMarketItemId; // funded above

    const sellerBalanceBefore = (await getAccount(connection, sellerAta)).amount;

    try {
      await program.methods
        .settleOrderYield(new BN(marketItemId))
        .accountsPartial({
          buyer: buyer.publicKey,
          sellerTokenAccount: sellerAta,
          orderState: orderPda(marketItemId),
          ...kaminoAccounts(marketItemId),
        })
        .signers([buyer])
        .rpc();
    } catch (err: any) {
      console.log("FULL LOGS:", err.logs ?? err.getLogs?.() ?? "(no logs on error object)");
      throw err;
    }

    const orderAccount = await program.account.orderState.fetch(orderPda(marketItemId));
    assert.equal(orderAccount.status.settled !== undefined, true);
    assert.equal(orderAccount.kTokenShares.toNumber(), 0);

    const sellerBalanceAfter = (await getAccount(connection, sellerAta)).amount;
    const received = sellerBalanceAfter - sellerBalanceBefore;
    console.log(`    -> seller received ${received.toString()} (principal was ${PRINCIPAL})`);
    // An instant deposit->redeem round trip can lose a couple of base units
    // to Kamino's own exchange-rate rounding (no time for real yield to
    // offset it) - a real holding period's yield would dwarf this dust.
    assert.isTrue(
      received >= BigInt(PRINCIPAL) - ROUNDING_TOLERANCE,
      `seller should receive ~the full principal back, got ${received}`
    );

    // Per-order kToken account should be closed (zero balance, rent reclaimed).
    const info = await connection.getAccountInfo(orderKtokenPda(marketItemId));
    assert.isNull(info, "order_ktoken_account should be closed after settlement");
  });

  it("routes yield on refund too, after the delivery deadline passes", async function () {
    this.timeout(60000);
    const marketItemId = refundMarketItemId;
    const order = await initListing(marketItemId, 3); // short window

    await program.methods
      .fundOrderYield(new BN(marketItemId))
      .accountsPartial({
        buyer: buyer.publicKey,
        buyerTokenAccount: buyerAta,
        systemProgram: SystemProgram.programId,
        orderState: order,
        ...kaminoAccounts(marketItemId),
      })
      .signers([buyer])
      .rpc();

    // Poll on-chain time rather than a fixed sleep - a warp-slotted
    // validator's clock calibration can lag real time for a bit.
    const orderBefore = await program.account.orderState.fetch(order);
    for (;;) {
      const slot = await connection.getSlot();
      const onChainTime = await connection.getBlockTime(slot);
      if (onChainTime && onChainTime >= orderBefore.deliveryDeadline.toNumber()) break;
      await sleep(1000);
    }

    const buyerBalanceBefore = (await getAccount(connection, buyerAta)).amount;

    await program.methods
      .refundOrderYield(new BN(marketItemId))
      .accountsPartial({
        payer: seller.publicKey,
        buyerTokenAccount: buyerAta,
        orderState: order,
        ...kaminoAccounts(marketItemId),
      })
      .signers([seller])
      .rpc();

    const orderAccount = await program.account.orderState.fetch(order);
    assert.equal(orderAccount.status.refunded !== undefined, true);

    const buyerBalanceAfter = (await getAccount(connection, buyerAta)).amount;
    const received = buyerBalanceAfter - buyerBalanceBefore;
    console.log(`    -> buyer refunded ${received.toString()} (principal was ${PRINCIPAL})`);
    assert.isTrue(
      received >= BigInt(PRINCIPAL) - ROUNDING_TOLERANCE,
      "buyer should get ~their principal back"
    );
  });
});
