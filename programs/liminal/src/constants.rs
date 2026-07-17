use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"liminal-vault";

#[constant]
pub const VAULT_TOKEN_SEED: &[u8] = b"liminal-vault-token";

#[constant]
pub const ORDER_SEED: &[u8] = b"order-state";

#[constant]
pub const ORDER_KTOKEN_SEED: &[u8] = b"order-ktoken";

#[constant]
pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle-config";

/// Message tag a trusted oracle signs alongside the order's PDA address to
/// attest delivery - see `settle_order_with_oracle`.
pub const DELIVERY_ATTESTATION_TAG: &[u8] = b"DELIVERED";

/// Message tag for the optimistic delivery-signal flow - distinct from
/// DELIVERY_ATTESTATION_TAG so a signature valid for one instruction can
/// never be replayed against the other, even though both are signed by the
/// same OracleConfig key. See `signal_delivery`.
pub const DELIVERY_SIGNAL_TAG: &[u8] = b"LIMINAL:DELIVERY:v1";

/// Message tag for dispute-verdict attestations - see `resolve_dispute`.
/// Distinct from the other two tags for the same replay-prevention reason.
pub const RESOLVE_DISPUTE_TAG: &[u8] = b"LIMINAL:RESOLVE:v1";

/// Kamino Lend (klend) mainnet program. There is no meaningful Kamino
/// deployment on devnet, so vaults with `yield_enabled = true` only make
/// sense against a mainnet deployment of this program.
pub const KAMINO_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// Percentage of a funded order's principal routed into Kamino for yield.
/// The remainder stays liquid in the vault's own token account, matching
/// the multi-tiered buffer model: instant redeemability for a portion of
/// deposits even if the lending market is temporarily illiquid.
pub const YIELD_BPS: u64 = 7_500; // 75.00%
pub const BPS_DENOMINATOR: u64 = 10_000;
