import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import idl from "./idl/liminal.json";
import type { Liminal } from "./idl/liminal";

export const VAULT_SEED = Buffer.from("liminal-vault");
export const VAULT_TOKEN_SEED = Buffer.from("liminal-vault-token");
export const ORDER_SEED = Buffer.from("order-state");
export const ORACLE_CONFIG_SEED = Buffer.from("oracle-config");

export const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/**
 * Read-only Anchor client used only to build instructions server-side. It
 * never signs or sends anything - the wallet stub exists purely to satisfy
 * AnchorProvider's constructor.
 */
export function getProgram(connection: Connection = getConnection()): Program<Liminal> {
  const readOnlyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async () => {
      throw new Error("server-side program client cannot sign transactions");
    },
    signAllTransactions: async () => {
      throw new Error("server-side program client cannot sign transactions");
    },
  };
  const provider = new AnchorProvider(connection, readOnlyWallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Liminal, provider);
}

export function marketItemIdToBn(marketItemId: bigint): BN {
  return new BN(marketItemId.toString());
}

export function orderStatePda(
  programId: PublicKey,
  seller: PublicKey,
  marketItemId: bigint
): PublicKey {
  const idBytes = marketItemIdToBn(marketItemId).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, seller.toBuffer(), idBytes],
    programId
  )[0];
}

export function unifiedVaultPda(programId: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED, mint.toBuffer()], programId)[0];
}

export function vaultTokenPda(programId: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_TOKEN_SEED, mint.toBuffer()], programId)[0];
}

export function oracleConfigPda(programId: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ORACLE_CONFIG_SEED, mint.toBuffer()], programId)[0];
}

/** A built transaction that simulation says would fail on-chain. */
export class SimulationError extends Error {}

/**
 * Simulates before returning: a transaction this API hands out should never
 * be one that's already doomed on-chain. Added after a real incident - a
 * program upgrade broke deserialization of pre-upgrade accounts, and the
 * checkout API kept happily returning transactions that could only fail,
 * with nothing surfacing until a wallet actually submitted one.
 */
export async function assertSimulates(connection: Connection, transaction: Transaction): Promise<void> {
  const sim = await connection.simulateTransaction(transaction);
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).slice(-4).join(" | ");
    throw new SimulationError(
      `transaction would fail on-chain: ${JSON.stringify(sim.value.err)}${logs ? ` (${logs})` : ""}`
    );
  }
}

/** Builds a base64-encoded, unsigned transaction for a wallet to sign client-side. */
export async function buildUnsignedTransaction(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[]
): Promise<string> {
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = feePayer;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  await assertSimulates(connection, transaction);
  return transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

/**
 * Anchor represents a Rust unit enum as `{ variantName: {} }`; pull out the
 * key and convert its camelCase variant name to SCREAMING_SNAKE_CASE (e.g.
 * `deliverySignaled` -> `DELIVERY_SIGNALED`), matching `ESCROW_STATUSES`.
 * Plain `.toUpperCase()` alone only worked by coincidence while every
 * variant was a single word.
 */
export function escrowStatusFromAccount(status: Record<string, unknown>): string {
  const variant = Object.keys(status)[0];
  return variant.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}
