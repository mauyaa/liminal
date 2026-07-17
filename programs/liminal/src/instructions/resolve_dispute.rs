use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked, ID as IX_SYSVAR_ID};
use solana_sdk_ids::ed25519_program::ID as ED25519_PROGRAM_ID;

use crate::{
    constants::*,
    error::LiminalError,
    state::{EscrowStatus, OracleConfig, OrderState, UnifiedVault},
};

/// Same byte-layout constants `settle_order_with_oracle`/`signal_delivery`
/// use for a native Ed25519SigVerify instruction.
const ED25519_PUBKEY_OFFSET: usize = 16;
const ED25519_PUBKEY_END: usize = ED25519_PUBKEY_OFFSET + 32;
const ED25519_MESSAGE_OFFSET: usize = ED25519_PUBKEY_END + 64;

/// Emitted on every resolution - the on-chain audit trail. `verdict_hash` is
/// a SHA-256 (computed off-chain) of the full published verdict reasoning,
/// so the ruling is tamper-evident without storing the reasoning text
/// itself in account state.
#[event]
pub struct DisputeResolved {
    pub order: Pubkey,
    pub seller_bps: u16,
    pub verdict_hash: [u8; 32],
}

/// Resolves a `Disputed` order by an oracle-attested verdict: `seller_bps`
/// of the principal goes to the seller, the remainder to the buyer. Reuses
/// the same `OracleConfig` key and Ed25519-introspection pattern
/// `settle_order_with_oracle`/`signal_delivery` already use, with its own
/// message tag so a verdict signature can't be replayed as either of those.
/// `seller_bps = 0` is a full refund, `10_000` a full settle, anything else
/// a real split - one payout path handles all three, no separate verdict
/// enum needed.
#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct ResolveDispute<'info> {
    /// Permissionless: anyone holding a valid verdict attestation may
    /// trigger it. Only pays the transaction fee.
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

    #[account(mut, token::mint = mint, token::authority = order_state.buyer)]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,

    /// CHECK: verified by address to be the real Instructions sysvar.
    #[account(address = IX_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn handle_resolve_dispute(
    ctx: Context<ResolveDispute>,
    _market_item_id: u64,
    seller_bps: u16,
    verdict_hash: [u8; 32],
) -> Result<()> {
    require!(seller_bps <= 10_000, LiminalError::InvalidSplitBps);
    require!(
        ctx.accounts.order_state.status == EscrowStatus::Disputed,
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

    // Signed message binds the order, the exact split, and the verdict hash
    // - none of these are trustworthy as plain instruction arguments alone
    // since a permissionless caller supplies them.
    let message = &data[ED25519_MESSAGE_OFFSET..];
    let order_key = ctx.accounts.order_state.key();
    let mut expected_message = Vec::with_capacity(32 + 2 + 32 + RESOLVE_DISPUTE_TAG.len());
    expected_message.extend_from_slice(order_key.as_ref());
    expected_message.extend_from_slice(&seller_bps.to_le_bytes());
    expected_message.extend_from_slice(&verdict_hash);
    expected_message.extend_from_slice(RESOLVE_DISPUTE_TAG);
    require!(
        message == expected_message.as_slice(),
        LiminalError::InvalidOracleAttestation
    );

    let principal = ctx.accounts.order_state.principal_amount;
    let seller_amount = (principal as u128)
        .checked_mul(seller_bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(LiminalError::MathOverflow)? as u64;
    let buyer_amount = principal.checked_sub(seller_amount).ok_or(LiminalError::MathOverflow)?;

    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.accounts.unified_vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    if seller_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.unified_vault.to_account_info(),
                },
                &[signer_seeds],
            ),
            seller_amount,
        )?;
    }
    if buyer_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.unified_vault.to_account_info(),
                },
                &[signer_seeds],
            ),
            buyer_amount,
        )?;
    }

    ctx.accounts.order_state.status = EscrowStatus::Resolved;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_sub(principal)
        .ok_or(LiminalError::MathOverflow)?;

    emit!(DisputeResolved { order: order_key, seller_bps, verdict_hash });

    Ok(())
}
