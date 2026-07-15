import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  address,
  createNoopSigner,
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  AccountRole,
  type Address as KitAddress,
  type Instruction as KitInstruction,
} from "@solana/kit";
import {
  SUBSCRIPTIONS_PROGRAM_ADDRESS,
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
  fetchMaybePlan,
  fetchMaybeSubscriptionAuthority,
  fetchMaybeSubscriptionDelegation,
  getCreatePlanOverlayInstructionAsync,
  getInitSubscriptionAuthorityOverlayInstructionAsync,
  getSubscribeOverlayInstructionAsync,
  getTransferSubscriptionOverlayInstructionAsync,
  getCancelSubscriptionOverlayInstructionAsync,
} from "@solana/subscriptions";
import { RPC_URL } from "./program";

/**
 * Recurring billing wired against the real, audited Solana Foundation
 * Subscriptions & Allowances program (shipped mainnet+devnet June 2026),
 * not a hand-rolled delegation scheme - see README's "Subscriptions" section
 * for why. This module is the only place that touches `@solana/kit`; every
 * exported function takes/returns plain `@solana/web3.js` types so the rest
 * of the app never has to know two Solana JS stacks are involved.
 */

export const SUBSCRIPTIONS_PROGRAM_ID = new PublicKey(SUBSCRIPTIONS_PROGRAM_ADDRESS);

const kitRpc = createSolanaRpcFromTransport(createDefaultRpcTransport({ url: RPC_URL }));

function toAddress(pubkey: PublicKey): KitAddress {
  return address(pubkey.toBase58());
}

/**
 * Marks an account as a required signer position without producing a real
 * signature, mirroring `program.ts`'s read-only Anchor wallet stub: the
 * server only ever builds unsigned transactions, the client wallet signs.
 */
function noopSigner(pubkey: PublicKey) {
  return createNoopSigner(toAddress(pubkey));
}

function toWeb3Instruction(ix: KitInstruction): TransactionInstruction {
  const keys = (ix.accounts ?? []).map((acc) => ({
    pubkey: new PublicKey(acc.address),
    isSigner: acc.role === AccountRole.WRITABLE_SIGNER || acc.role === AccountRole.READONLY_SIGNER,
    isWritable: acc.role === AccountRole.WRITABLE_SIGNER || acc.role === AccountRole.WRITABLE,
  }));
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys,
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

export async function planPda(owner: PublicKey, planId: bigint): Promise<PublicKey> {
  const [addr] = await findPlanPda({ owner: toAddress(owner), planId });
  return new PublicKey(addr);
}

export async function subscriptionAuthorityPda(user: PublicKey, tokenMint: PublicKey): Promise<PublicKey> {
  const [addr] = await findSubscriptionAuthorityPda({ user: toAddress(user), tokenMint: toAddress(tokenMint) });
  return new PublicKey(addr);
}

export async function subscriptionDelegationPda(plan: PublicKey, subscriber: PublicKey): Promise<PublicKey> {
  const [addr] = await findSubscriptionDelegationPda({ planPda: toAddress(plan), subscriber: toAddress(subscriber) });
  return new PublicKey(addr);
}

/** Whether a SubscriptionAuthority PDA already exists on-chain for this (user, mint) pair. */
export async function hasSubscriptionAuthority(user: PublicKey, tokenMint: PublicKey): Promise<boolean> {
  const authority = await subscriptionAuthorityPda(user, tokenMint);
  const account = await fetchMaybeSubscriptionAuthority(kitRpc, toAddress(authority));
  return account.exists;
}

interface LivePlanTerms {
  mint: PublicKey;
  amount: bigint;
  periodHours: bigint;
  createdAt: bigint;
  endTs: bigint;
}

/**
 * Reads a plan's current on-chain terms. Never trust a cached DB copy here -
 * a merchant can call `update_plan` after it was cached, and binding a
 * subscriber (or a collect) to stale terms is exactly what the program's own
 * `PlanTermsMismatch` check exists to prevent.
 */
export async function fetchLivePlanTerms(plan: PublicKey): Promise<LivePlanTerms> {
  const account = await fetchMaybePlan(kitRpc, toAddress(plan));
  if (!account.exists) {
    throw new Error(`plan ${plan.toBase58()} does not exist on-chain`);
  }
  return {
    mint: new PublicKey(account.data.data.mint),
    amount: account.data.data.terms.amount,
    periodHours: account.data.data.terms.periodHours,
    createdAt: account.data.data.terms.createdAt,
    endTs: account.data.data.endTs,
  };
}

export async function createPlanIx(params: {
  owner: PublicKey;
  planId: bigint;
  mint: PublicKey;
  amount: bigint;
  periodHours: bigint;
  destinations: PublicKey[];
  pullers: PublicKey[];
  tokenProgram: PublicKey;
  endTs?: bigint;
  metadataUri?: string;
}): Promise<TransactionInstruction> {
  const ix = await getCreatePlanOverlayInstructionAsync({
    owner: noopSigner(params.owner),
    planId: params.planId,
    mint: toAddress(params.mint),
    amount: params.amount,
    periodHours: params.periodHours,
    destinations: params.destinations.map(toAddress),
    pullers: params.pullers.map(toAddress),
    endTs: params.endTs ?? BigInt(0),
    metadataUri: params.metadataUri ?? "",
    tokenProgram: toAddress(params.tokenProgram),
  });
  return toWeb3Instruction(ix);
}

export async function initSubscriptionAuthorityIx(params: {
  owner: PublicKey;
  tokenMint: PublicKey;
  tokenProgram: PublicKey;
  userAta: PublicKey;
}): Promise<TransactionInstruction> {
  const ix = await getInitSubscriptionAuthorityOverlayInstructionAsync({
    owner: noopSigner(params.owner),
    tokenMint: toAddress(params.tokenMint),
    tokenProgram: toAddress(params.tokenProgram),
    userAta: toAddress(params.userAta),
  });
  return toWeb3Instruction(ix);
}

/**
 * Builds a Subscribe instruction bound to the plan's live on-chain terms.
 *
 * Requires a `SubscriptionAuthority` for (subscriber, plan's mint) to already
 * exist on-chain - call `initSubscriptionAuthorityIx` first (as its own
 * landed transaction) for a first-time subscriber. An earlier design tried
 * bundling init + subscribe in one transaction using the program's
 * `UNKNOWN_INIT_ID` same-slot sentinel; that was rejected by the live devnet
 * deployment with `StaleSubscriptionAuthority`, so this always binds to a
 * concrete, already-confirmed `init_id` instead of relying on same-slot
 * semantics this code can't independently verify against the deployed
 * program build.
 */
export async function subscribeIx(params: {
  subscriber: PublicKey;
  merchant: PublicKey;
  planId: bigint;
}): Promise<TransactionInstruction> {
  const plan = await planPda(params.merchant, params.planId);
  const terms = await fetchLivePlanTerms(plan);

  const authority = await subscriptionAuthorityPda(params.subscriber, terms.mint);
  const account = await fetchMaybeSubscriptionAuthority(kitRpc, toAddress(authority));
  if (!account.exists) {
    throw new Error("no SubscriptionAuthority exists for this subscriber/mint - call initSubscriptionAuthorityIx first");
  }
  const expectedInitId = account.data.initId;

  const ix = await getSubscribeOverlayInstructionAsync({
    subscriber: noopSigner(params.subscriber),
    merchant: toAddress(params.merchant),
    planId: params.planId,
    tokenMint: toAddress(terms.mint),
    expectedAmount: terms.amount,
    expectedPeriodHours: terms.periodHours,
    expectedCreatedAt: terms.createdAt,
    expectedSubscriptionAuthorityInitId: expectedInitId,
  });
  return toWeb3Instruction(ix);
}

/** Pulls one period's payment. `caller` must be the plan's owner or a registered puller; `receiverAta`'s owner must be one of the plan's registered `destinations`. */
export async function collectSubscriptionIx(params: {
  caller: PublicKey;
  subscriber: PublicKey;
  merchant: PublicKey;
  planId: bigint;
  receiverAta: PublicKey;
  tokenProgram: PublicKey;
}): Promise<TransactionInstruction> {
  const plan = await planPda(params.merchant, params.planId);
  const terms = await fetchLivePlanTerms(plan);
  const subscription = await subscriptionDelegationPda(plan, params.subscriber);

  const ix = await getTransferSubscriptionOverlayInstructionAsync({
    caller: noopSigner(params.caller),
    delegator: toAddress(params.subscriber),
    planPda: toAddress(plan),
    receiverAta: toAddress(params.receiverAta),
    subscriptionPda: toAddress(subscription),
    tokenMint: toAddress(terms.mint),
    tokenProgram: toAddress(params.tokenProgram),
    amount: terms.amount,
  });
  return toWeb3Instruction(ix);
}

/**
 * Whether a subscription is due for a collect right now, read directly from
 * its live on-chain state - not a replacement for the on-chain program's own
 * enforcement in `transfer_subscription` (which remains authoritative and is
 * still checked on every collect), just a cheap precheck so an autonomous
 * poller doesn't waste a transaction (and a devnet/mainnet fee) attempting
 * collects that are obviously not due yet.
 */
export async function isSubscriptionDueForCollect(subscriptionPda: PublicKey): Promise<boolean> {
  const account = await fetchMaybeSubscriptionDelegation(kitRpc, toAddress(subscriptionPda));
  if (!account.exists) return false;

  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  const { expiresAtTs, currentPeriodStartTs, amountPulledInPeriod, terms } = account.data;

  if (expiresAtTs !== BigInt(0) && nowSecs >= expiresAtTs) return false; // cancelled and past its paid-through period

  const periodLengthSecs = terms.periodHours * BigInt(3600);
  const periodEnd = currentPeriodStartTs + periodLengthSecs;
  const alreadyCollectedThisPeriod = nowSecs < periodEnd && amountPulledInPeriod >= terms.amount;
  return !alreadyCollectedThisPeriod;
}

export async function cancelSubscriptionIx(params: {
  subscriber: PublicKey;
  merchant: PublicKey;
  planId: bigint;
}): Promise<TransactionInstruction> {
  const plan = await planPda(params.merchant, params.planId);
  const ix = await getCancelSubscriptionOverlayInstructionAsync({
    subscriber: noopSigner(params.subscriber),
    planPda: toAddress(plan),
  });
  return toWeb3Instruction(ix);
}
