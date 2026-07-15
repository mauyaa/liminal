use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, state::UnifiedVault};

/// Same as `initialize_vault`, but also configures a specific Kamino Lend
/// reserve for this mint. Kamino only has a meaningful mainnet deployment,
/// so a vault initialized this way only makes sense there - `authority` is
/// fully trusted to supply correct values (Kamino's own program
/// independently validates them on every CPI, so a wrong value here just
/// fails the CPI, it never misdirects funds).
#[derive(Accounts)]
pub struct InitializeVaultYield<'info> {
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

#[allow(clippy::too_many_arguments)]
pub fn handle_initialize_vault_yield(
    ctx: Context<InitializeVaultYield>,
    kamino_lending_market: Pubkey,
    kamino_reserve: Pubkey,
    kamino_lending_market_authority: Pubkey,
    kamino_reserve_liquidity_supply: Pubkey,
    kamino_reserve_collateral_mint: Pubkey,
    kamino_pyth_oracle: Pubkey,
    kamino_switchboard_price_oracle: Pubkey,
    kamino_switchboard_twap_oracle: Pubkey,
    kamino_scope_prices: Pubkey,
) -> Result<()> {
    let vault = &mut ctx.accounts.unified_vault;
    vault.authority = ctx.accounts.authority.key();
    vault.mint = ctx.accounts.mint.key();
    vault.token_vault = ctx.accounts.token_vault.key();
    vault.total_active_principal = 0;
    vault.yield_enabled = true;
    vault.kamino_program = KAMINO_PROGRAM_ID;
    vault.kamino_lending_market = kamino_lending_market;
    vault.kamino_lending_market_authority = kamino_lending_market_authority;
    vault.kamino_reserve = kamino_reserve;
    vault.kamino_reserve_liquidity_supply = kamino_reserve_liquidity_supply;
    vault.kamino_reserve_collateral_mint = kamino_reserve_collateral_mint;
    vault.kamino_pyth_oracle = kamino_pyth_oracle;
    vault.kamino_switchboard_price_oracle = kamino_switchboard_price_oracle;
    vault.kamino_switchboard_twap_oracle = kamino_switchboard_twap_oracle;
    vault.kamino_scope_prices = kamino_scope_prices;
    vault.bump = ctx.bumps.unified_vault;
    Ok(())
}
