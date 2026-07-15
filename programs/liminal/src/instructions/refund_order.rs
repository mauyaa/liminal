use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{constants::*, error::LiminalError, state::{EscrowStatus, OrderState, UnifiedVault}};

#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct RefundOrder<'info> {
    /// Permissionless: anyone may trigger a timeout refund once the
    /// delivery deadline has passed. Only pays the transaction fee.
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

    #[account(mut, token::mint = mint, token::authority = order_state.buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund_order(ctx: Context<RefundOrder>, _market_item_id: u64) -> Result<()> {
    let order = &ctx.accounts.order_state;
    require!(order.status == EscrowStatus::Funded, LiminalError::InvalidState);
    require!(
        Clock::get()?.unix_timestamp >= order.delivery_deadline,
        LiminalError::DeadlineNotReached
    );

    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.accounts.unified_vault.bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.buyer_token_account.to_account_info(),
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
    ctx.accounts.order_state.status = EscrowStatus::Refunded;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_sub(principal)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
