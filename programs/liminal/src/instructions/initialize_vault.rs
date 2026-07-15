use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, state::UnifiedVault};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = UnifiedVault::SPACE,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump
    )]
    pub unified_vault: Account<'info, UnifiedVault>,

    #[account(
        init,
        payer = authority,
        seeds = [VAULT_TOKEN_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = unified_vault,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.unified_vault;
    vault.authority = ctx.accounts.authority.key();
    vault.mint = ctx.accounts.mint.key();
    vault.token_vault = ctx.accounts.token_vault.key();
    vault.total_active_principal = 0;
    vault.bump = ctx.bumps.unified_vault;
    Ok(())
}
