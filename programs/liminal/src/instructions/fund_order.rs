use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{constants::*, error::LiminalError, state::{EscrowStatus, OrderState, UnifiedVault}};

#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct FundOrder<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

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

    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_fund_order(ctx: Context<FundOrder>, _market_item_id: u64) -> Result<()> {
    let order = &ctx.accounts.order_state;
    require!(order.status == EscrowStatus::Initialized, LiminalError::InvalidState);

    let cpi_accounts = Transfer {
        from: ctx.accounts.buyer_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        order.principal_amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let deadline = now
        .checked_add(order.delivery_window)
        .ok_or(LiminalError::MathOverflow)?;

    let order = &mut ctx.accounts.order_state;
    order.buyer = ctx.accounts.buyer.key();
    order.start_timestamp = now;
    order.delivery_deadline = deadline;
    order.status = EscrowStatus::Funded;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_add(order.principal_amount)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
