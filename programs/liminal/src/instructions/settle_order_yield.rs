use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::LiminalError,
    kamino::{self, KaminoReserveAccounts},
    state::{EscrowStatus, OrderState, UnifiedVault},
};

#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct SettleOrderYield<'info> {
    /// Buyer confirms receipt and releases funds (principal + this order's
    /// share of accrued yield) to the seller. Marked mut: receives the
    /// reclaimed rent when the per-order kToken account is closed below.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: only used to derive/verify the order PDA's seller seed.
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, seller.key().as_ref(), market_item_id.to_le_bytes().as_ref()],
        bump = order_state.bump,
        has_one = seller @ LiminalError::InvalidState,
        has_one = buyer @ LiminalError::InvalidState,
    )]
    pub order_state: Box<Account<'info, OrderState>>,

    #[account(
        mut,
        seeds = [ORDER_KTOKEN_SEED, seller.key().as_ref(), market_item_id.to_le_bytes().as_ref()],
        bump,
        token::mint = kamino_reserve_collateral_mint,
        token::authority = unified_vault,
    )]
    pub order_ktoken_account: Box<Account<'info, TokenAccount>>,

    #[account(address = order_state.mint)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump = unified_vault.bump,
        constraint = unified_vault.yield_enabled @ LiminalError::YieldNotEnabled,
    )]
    pub unified_vault: Box<Account<'info, UnifiedVault>>,

    #[account(mut, address = unified_vault.token_vault)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: verified against `unified_vault.kamino_program`.
    #[account(address = unified_vault.kamino_program)]
    pub kamino_program: UncheckedAccount<'info>,
    /// CHECK: verified against `unified_vault.kamino_reserve`.
    #[account(mut, address = unified_vault.kamino_reserve)]
    pub kamino_reserve: UncheckedAccount<'info>,
    /// CHECK: verified against `unified_vault.kamino_lending_market`.
    #[account(address = unified_vault.kamino_lending_market)]
    pub kamino_lending_market: UncheckedAccount<'info>,
    /// CHECK: verified against `unified_vault.kamino_lending_market_authority`.
    #[account(address = unified_vault.kamino_lending_market_authority)]
    pub kamino_lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: verified against `unified_vault.kamino_reserve_liquidity_supply`.
    #[account(mut, address = unified_vault.kamino_reserve_liquidity_supply)]
    pub kamino_reserve_liquidity_supply: UncheckedAccount<'info>,
    /// CHECK: verified against `unified_vault.kamino_reserve_collateral_mint`.
    #[account(mut, address = unified_vault.kamino_reserve_collateral_mint)]
    pub kamino_reserve_collateral_mint: Box<Account<'info, Mint>>,
    /// CHECK: passed through to Kamino; only read when `unified_vault.kamino_pyth_oracle` is set.
    pub kamino_pyth_oracle: UncheckedAccount<'info>,
    /// CHECK: passed through to Kamino; only read when `unified_vault.kamino_switchboard_price_oracle` is set.
    pub kamino_switchboard_price_oracle: UncheckedAccount<'info>,
    /// CHECK: passed through to Kamino; only read when `unified_vault.kamino_switchboard_twap_oracle` is set.
    pub kamino_switchboard_twap_oracle: UncheckedAccount<'info>,
    /// CHECK: passed through to Kamino; only read when `unified_vault.kamino_scope_prices` is set.
    pub kamino_scope_prices: UncheckedAccount<'info>,
    /// CHECK: the Instructions sysvar, required by Kamino's redeem instruction.
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

fn optional_oracle<'a, 'info>(
    configured: Pubkey,
    provided: &'a AccountInfo<'info>,
) -> Result<Option<&'a AccountInfo<'info>>> {
    if configured == Pubkey::default() {
        return Ok(None);
    }
    require_keys_eq!(provided.key(), configured, LiminalError::InvalidState);
    Ok(Some(provided))
}

pub fn handle_settle_order_yield(ctx: Context<SettleOrderYield>, _market_item_id: u64) -> Result<()> {
    require!(
        ctx.accounts.order_state.status == EscrowStatus::Funded,
        LiminalError::InvalidState
    );

    let principal = ctx.accounts.order_state.principal_amount;
    let yield_amount = principal
        .checked_mul(YIELD_BPS)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(LiminalError::MathOverflow)?;
    let buffer_amount = principal
        .checked_sub(yield_amount)
        .ok_or(LiminalError::MathOverflow)?;
    let k_token_shares = ctx.accounts.order_state.k_token_shares;
    let vault_balance_before = ctx.accounts.vault_token_account.amount;

    // Redeem this order's kTokens back into the vault's own token account -
    // whatever comes back is principal + this order's share of accrued
    // yield, per Kamino's own exchange-rate math (we don't replicate it).
    let vault_cfg = &ctx.accounts.unified_vault;
    let mint_ai = ctx.accounts.mint.to_account_info();
    let kamino_reserve_collateral_mint_ai = ctx.accounts.kamino_reserve_collateral_mint.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let unified_vault_ai = ctx.accounts.unified_vault.to_account_info();
    let order_ktoken_account_ai = ctx.accounts.order_ktoken_account.to_account_info();
    let vault_token_account_ai = ctx.accounts.vault_token_account.to_account_info();

    let kamino = KaminoReserveAccounts {
        kamino_program: &ctx.accounts.kamino_program,
        reserve: &ctx.accounts.kamino_reserve,
        lending_market: &ctx.accounts.kamino_lending_market,
        lending_market_authority: &ctx.accounts.kamino_lending_market_authority,
        reserve_liquidity_mint: &mint_ai,
        reserve_liquidity_supply: &ctx.accounts.kamino_reserve_liquidity_supply,
        reserve_collateral_mint: &kamino_reserve_collateral_mint_ai,
        collateral_token_program: &token_program_ai,
        liquidity_token_program: &token_program_ai,
        instructions_sysvar: &ctx.accounts.instructions_sysvar,
        pyth_oracle: optional_oracle(vault_cfg.kamino_pyth_oracle, &ctx.accounts.kamino_pyth_oracle)?,
        switchboard_price_oracle: optional_oracle(
            vault_cfg.kamino_switchboard_price_oracle,
            &ctx.accounts.kamino_switchboard_price_oracle,
        )?,
        switchboard_twap_oracle: optional_oracle(
            vault_cfg.kamino_switchboard_twap_oracle,
            &ctx.accounts.kamino_switchboard_twap_oracle,
        )?,
        scope_prices: optional_oracle(vault_cfg.kamino_scope_prices, &ctx.accounts.kamino_scope_prices)?,
    };

    kamino::refresh_reserve(&kamino)?;

    // Kamino's own redeem instruction requires `user_destination_liquidity`
    // (vault_token_account) to be owned by the same `owner` that authorizes
    // `user_source_collateral` (order_ktoken_account) - so both token
    // accounts share `unified_vault` as their SPL authority, not order_state.
    let mint_key = ctx.accounts.mint.key();
    let vault_bump = vault_cfg.bump;
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    kamino::redeem_reserve_collateral(
        &kamino,
        &unified_vault_ai,
        &order_ktoken_account_ai,
        &vault_token_account_ai,
        k_token_shares,
        vault_seeds,
    )?;

    // This order's entitlement: the 25% buffer that never left, plus
    // whatever the redeem just added to the vault's balance (principal's
    // yield-routed portion plus any accrued yield). Computed as a balance
    // delta rather than trusting a computed exchange rate, and scoped to
    // only this order's redeem so other orders' buffers already sitting in
    // the shared vault_token_account are never touched.
    ctx.accounts.vault_token_account.reload()?;
    let redeemed_amount = ctx
        .accounts
        .vault_token_account
        .amount
        .checked_sub(vault_balance_before)
        .ok_or(LiminalError::MathOverflow)?;
    let payout = buffer_amount
        .checked_add(redeemed_amount)
        .ok_or(LiminalError::MathOverflow)?;

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: ctx.accounts.unified_vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            &[vault_seeds],
        ),
        payout,
    )?;

    // Reclaim the now-empty per-order kToken account's rent for the buyer.
    let close_accounts = CloseAccount {
        account: ctx.accounts.order_ktoken_account.to_account_info(),
        destination: ctx.accounts.buyer.to_account_info(),
        authority: ctx.accounts.unified_vault.to_account_info(),
    };
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        close_accounts,
        &[vault_seeds],
    ))?;

    ctx.accounts.order_state.status = EscrowStatus::Settled;
    ctx.accounts.order_state.k_token_shares = 0;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_sub(principal)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
