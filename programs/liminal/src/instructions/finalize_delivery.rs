use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{constants::*, error::LiminalError, state::{EscrowStatus, OrderState, UnifiedVault}};

/// Permissionless: settles a signaled delivery once the challenge window has
/// passed unchallenged. This is what makes "auto-releases unless disputed"
/// actually automatic rather than depending on the buyer to click confirm -
/// identical transfer body to `settle_order` and `confirm_delivery`, gated
/// on `DeliverySignaled` + the window having elapsed instead of a signature.
#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct FinalizeDelivery<'info> {
    /// Anyone may trigger this once the window has passed. Only pays the
    /// transaction fee.
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

    #[account(address = order_state.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump = unified_vault.bump,
    )]
    pub unified_vault: Account<'info, UnifiedVault>,

    #[account(mut, address = unified_vault.token_vault)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_finalize_delivery(ctx: Context<FinalizeDelivery>, _market_item_id: u64) -> Result<()> {
    require!(
        ctx.accounts.order_state.status == EscrowStatus::DeliverySignaled,
        LiminalError::InvalidState
    );
    require!(
        Clock::get()?.unix_timestamp >= ctx.accounts.order_state.challenge_deadline,
        LiminalError::ChallengeWindowNotElapsed
    );

    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.accounts.unified_vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: ctx.accounts.unified_vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            &[signer_seeds],
        ),
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
