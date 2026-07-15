use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked, ID as IX_SYSVAR_ID};
use solana_sdk_ids::ed25519_program::ID as ED25519_PROGRAM_ID;

use crate::{
    constants::*,
    error::LiminalError,
    state::{EscrowStatus, OracleConfig, OrderState, UnifiedVault},
};

/// Byte offsets within a native Ed25519 program instruction's data, per the
/// canonical layout both `@solana/web3.js`'s `Ed25519Program` and Rust's
/// `solana_sdk::ed25519_instruction::new_ed25519_instruction` produce for a
/// single signature: [2-byte header][14-byte offsets table][32-byte
/// pubkey][64-byte signature][message]. Verified directly against both
/// SDKs' source rather than assumed - pubkey comes *before* the signature,
/// not after.
const ED25519_PUBKEY_OFFSET: usize = 16;
const ED25519_PUBKEY_END: usize = ED25519_PUBKEY_OFFSET + 32;
const ED25519_MESSAGE_OFFSET: usize = ED25519_PUBKEY_END + 64;

/// Automated, permissionless settlement: releases an order's escrowed
/// principal to the seller the moment a valid delivery attestation exists,
/// with no buyer confirmation needed. The attestation is verified using
/// Solana's standard native-program pattern: the actual Ed25519 signature
/// check runs in the Ed25519SigVerify111... program (a preceding
/// instruction in the same transaction), and this instruction introspects
/// the Instructions sysvar to confirm that check ran, ran over the exact
/// message expected for this specific order, and was signed by this vault's
/// configured oracle key - not just any valid-looking signature.
///
/// In production the signer would be a registered Switchboard TEE enclave's
/// attestation key (see README's "Oracle settlement" section for what that
/// requires and why it isn't wired up as a live registered function here);
/// this instruction's own on-chain verification logic is real and complete
/// regardless of which key is configured as trusted.
#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct SettleOrderWithOracle<'info> {
    /// Permissionless: anyone holding a valid attestation may trigger
    /// settlement. Only pays the transaction fee.
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
    pub order_state: Box<Account<'info, OrderState>>,

    #[account(address = order_state.mint)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        seeds = [ORACLE_CONFIG_SEED, mint.key().as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Box<Account<'info, OracleConfig>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump = unified_vault.bump,
    )]
    pub unified_vault: Box<Account<'info, UnifiedVault>>,

    #[account(mut, address = unified_vault.token_vault)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,

    /// CHECK: verified by address to be the real Instructions sysvar.
    #[account(address = IX_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn handle_settle_order_with_oracle(
    ctx: Context<SettleOrderWithOracle>,
    _market_item_id: u64,
) -> Result<()> {
    require!(
        ctx.accounts.order_state.status == EscrowStatus::Funded,
        LiminalError::InvalidState
    );

    // The Ed25519 verification instruction must immediately precede this
    // one in the same transaction.
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

    // Signed message must be exactly this order's PDA address followed by
    // the delivery tag - binds the attestation to this specific order, so
    // a signature can't be replayed against a different one.
    let message = &data[ED25519_MESSAGE_OFFSET..];
    let order_key = ctx.accounts.order_state.key();
    let mut expected_message = Vec::with_capacity(32 + DELIVERY_ATTESTATION_TAG.len());
    expected_message.extend_from_slice(order_key.as_ref());
    expected_message.extend_from_slice(DELIVERY_ATTESTATION_TAG);
    require!(
        message == expected_message.as_slice(),
        LiminalError::InvalidOracleAttestation
    );

    // From here, identical to settle_order: release principal to the seller.
    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.accounts.unified_vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: ctx.accounts.unified_vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, &[signer_seeds]),
        ctx.accounts.order_state.principal_amount,
    )?;

    let principal = ctx.accounts.order_state.principal_amount;
    ctx.accounts.order_state.status = EscrowStatus::Settled;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_sub(principal)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
