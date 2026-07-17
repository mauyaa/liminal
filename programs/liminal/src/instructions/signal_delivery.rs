use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked, ID as IX_SYSVAR_ID};
use solana_sdk_ids::ed25519_program::ID as ED25519_PROGRAM_ID;

use crate::{
    constants::*,
    error::LiminalError,
    state::{EscrowStatus, OracleConfig, OrderState},
};

/// Same byte-layout constants `settle_order_with_oracle` uses for a native
/// Ed25519SigVerify instruction - see that file's doc comment for how these
/// offsets were verified.
const ED25519_PUBKEY_OFFSET: usize = 16;
const ED25519_PUBKEY_END: usize = ED25519_PUBKEY_OFFSET + 32;
const ED25519_MESSAGE_OFFSET: usize = ED25519_PUBKEY_END + 64;

/// Opens the optimistic release window: an oracle attestation says delivery
/// happened, and the order settles itself after `CHALLENGE_WINDOW_SECS`
/// unless the buyer calls `challenge_order` first. Reuses the same
/// `OracleConfig` key `settle_order_with_oracle` trusts, just for a
/// differently-tagged message (`DELIVERY_SIGNAL_TAG`) so a signature valid
/// for one instruction can't be replayed as the other.
#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct SignalDelivery<'info> {
    /// Permissionless: anyone holding a valid attestation may trigger this.
    /// Only pays the transaction fee - no funds move here.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: only used to derive/verify the order PDA's seller seed.
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, seller.key().as_ref(), market_item_id.to_le_bytes().as_ref()],
        bump = order_state.bump,
        has_one = seller @ LiminalError::InvalidState,
    )]
    pub order_state: Account<'info, OrderState>,

    #[account(
        seeds = [ORACLE_CONFIG_SEED, order_state.mint.as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: verified by address to be the real Instructions sysvar.
    #[account(address = IX_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn handle_signal_delivery(
    ctx: Context<SignalDelivery>,
    _market_item_id: u64,
    challenge_window_secs: i64,
) -> Result<()> {
    require!(challenge_window_secs > 0, LiminalError::InvalidListingParams);
    require!(
        ctx.accounts.order_state.status == EscrowStatus::Funded,
        LiminalError::InvalidState
    );

    let current_index = load_current_index_checked(&ctx.accounts.instructions_sysvar)?;
    require!(current_index > 0, LiminalError::MissingOracleAttestation);
    let ed25519_ix =
        load_instruction_at_checked((current_index - 1) as usize, &ctx.accounts.instructions_sysvar)?;
    require_keys_eq!(
        ed25519_ix.program_id,
        ED25519_PROGRAM_ID,
        LiminalError::MissingOracleAttestation
    );

    let data = &ed25519_ix.data;
    require!(
        data.len() >= ED25519_MESSAGE_OFFSET,
        LiminalError::InvalidOracleAttestation
    );

    let signer_pubkey = &data[ED25519_PUBKEY_OFFSET..ED25519_PUBKEY_END];
    require!(
        signer_pubkey == ctx.accounts.oracle_config.oracle_pubkey.as_ref(),
        LiminalError::UntrustedOracle
    );

    // The signed message binds both the order and the exact challenge
    // window: challenge_window_secs is a plain instruction argument (not
    // itself signed data), so without including it here a permissionless
    // caller could replay a valid oracle signature alongside a different
    // (e.g. zero-ish) window than what the oracle actually attested to.
    let message = &data[ED25519_MESSAGE_OFFSET..];
    let order_key = ctx.accounts.order_state.key();
    let mut expected_message = Vec::with_capacity(32 + 8 + DELIVERY_SIGNAL_TAG.len());
    expected_message.extend_from_slice(order_key.as_ref());
    expected_message.extend_from_slice(&challenge_window_secs.to_le_bytes());
    expected_message.extend_from_slice(DELIVERY_SIGNAL_TAG);
    require!(
        message == expected_message.as_slice(),
        LiminalError::InvalidOracleAttestation
    );

    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order_state;
    order.status = EscrowStatus::DeliverySignaled;
    order.challenge_deadline = now
        .checked_add(challenge_window_secs)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
