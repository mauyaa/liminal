import { createHash } from "node:crypto";
import { Keypair, Transaction } from "@solana/web3.js";

/**
 * Flat USDC-equivalent fee (smallest unit, 6 decimals) a sponsored checkout
 * repays the relayer, covering its ~2-signer base transaction fee (~10,000
 * lamports, a fraction of a cent) with margin. Not a cost-plus calculation -
 * a deliberately simple flat fee.
 */
export const RELAYER_FEE_BASE_UNITS = 10_000; // $0.01 at 6 decimals

/** How long a server-approved sponsored transaction may sit unsubmitted before it's no longer honored. */
export const SPONSORSHIP_TTL_MS = 2 * 60 * 1000;

let cachedRelayer: Keypair | null = null;

/**
 * The relayer keypair that pays SOL fees for sponsored checkouts. Loaded
 * from `RELAYER_SECRET_KEY` (a JSON-array secret key, same format
 * `solana-keygen` writes). For real production use, this should be a
 * KMS/Kora-backed signer, not a raw key in an env var - see README's
 * "Gasless checkout" section.
 */
export function getRelayerKeypair(): Keypair {
  if (cachedRelayer) return cachedRelayer;

  const raw = process.env.RELAYER_SECRET_KEY;
  if (!raw) {
    throw new Error("RELAYER_SECRET_KEY is not set - sponsored checkout is unavailable");
  }
  const secret = Uint8Array.from(JSON.parse(raw));
  cachedRelayer = Keypair.fromSecretKey(secret);
  return cachedRelayer;
}

/** Identifies a transaction by its compiled message bytes, which a wallet's signing step never changes. */
export function messageHash(transaction: Transaction): string {
  return createHash("sha256").update(transaction.compileMessage().serialize()).digest("hex");
}
