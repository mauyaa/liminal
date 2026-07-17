import { Keypair, PublicKey, Ed25519Program, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";

/** Must match `DELIVERY_SIGNAL_TAG` in programs/liminal/src/constants.rs exactly. */
const DELIVERY_SIGNAL_TAG = Buffer.from("LIMINAL:DELIVERY:v1");
/** Must match `RESOLVE_DISPUTE_TAG` in programs/liminal/src/constants.rs exactly. */
const RESOLVE_DISPUTE_TAG = Buffer.from("LIMINAL:RESOLVE:v1");

let cachedOracle: Keypair | null = null;

/**
 * The keypair that signs `signal_delivery` attestations. Loaded from
 * `DELIVERY_ORACLE_SECRET_KEY` (same raw-JSON-secret-key convention as
 * `relayer.ts`'s `getRelayerKeypair`) - for real production use this should
 * be a KMS/HSM-backed signer, not a raw key in an env var, exactly the same
 * caveat the relayer carries. Its public key must be registered on-chain via
 * the existing `initialize_oracle_config` instruction for the mint(s) it
 * signs for - it's the same `OracleConfig` `settle_order_with_oracle`
 * already trusts, just also signing this differently-tagged message.
 */
export function getDeliveryOracleKeypair(): Keypair {
  if (cachedOracle) return cachedOracle;

  const raw = process.env.DELIVERY_ORACLE_SECRET_KEY;
  if (!raw) {
    throw new Error("DELIVERY_ORACLE_SECRET_KEY is not set - delivery signaling is unavailable");
  }
  const secret = Uint8Array.from(JSON.parse(raw));
  cachedOracle = Keypair.fromSecretKey(secret);
  return cachedOracle;
}

/**
 * Builds the native Ed25519SigVerify instruction `signal_delivery` expects
 * immediately preceding it in the same transaction. The signed message is
 * `orderPda || challengeWindowSecs (i64 LE) || DELIVERY_SIGNAL_TAG` - must
 * match `signal_delivery`'s on-chain reconstruction exactly, including
 * binding the window into the signature so it can't be swapped out by
 * whoever submits the transaction.
 */
export function buildSignalDeliveryAttestation(
  orderPda: PublicKey,
  challengeWindowSecs: number
): TransactionInstruction {
  const oracle = getDeliveryOracleKeypair();
  const windowBytes = Buffer.alloc(8);
  windowBytes.writeBigInt64LE(BigInt(challengeWindowSecs));
  const message = Buffer.concat([orderPda.toBuffer(), windowBytes, DELIVERY_SIGNAL_TAG]);
  const signature = nacl.sign.detached(message, oracle.secretKey);

  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBytes(),
    message,
    signature,
  });
}

/**
 * Builds the native Ed25519SigVerify instruction `resolve_dispute` expects
 * immediately preceding it. The signed message is `orderPda || sellerBps (u16
 * LE) || verdictHash (32 bytes) || RESOLVE_DISPUTE_TAG` - binding the split
 * and the verdict hash into the signature the same way the window is bound
 * into `signal_delivery`'s, so neither can be swapped out by whoever submits
 * the transaction. Uses the same oracle key as delivery signaling - see this
 * file's top-level doc comment on `getDeliveryOracleKeypair`.
 */
export function buildResolveDisputeAttestation(
  orderPda: PublicKey,
  sellerBps: number,
  verdictHash: Buffer
): TransactionInstruction {
  if (verdictHash.length !== 32) throw new Error("verdictHash must be exactly 32 bytes");
  const oracle = getDeliveryOracleKeypair();
  const bpsBytes = Buffer.alloc(2);
  bpsBytes.writeUInt16LE(sellerBps);
  const message = Buffer.concat([orderPda.toBuffer(), bpsBytes, verdictHash, RESOLVE_DISPUTE_TAG]);
  const signature = nacl.sign.detached(message, oracle.secretKey);

  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBytes(),
    message,
    signature,
  });
}
