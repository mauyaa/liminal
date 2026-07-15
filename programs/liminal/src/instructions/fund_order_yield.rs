use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::LiminalError,
    kamino::{self, KaminoReserveAccounts},
    state::{EscrowStatus, OrderState, UnifiedVault},
};

#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct FundOrderYield<'info> {
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
    pub order_state: Box<Account<'info, OrderState>>,

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

    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = buyer,
        seeds = [ORDER_KTOKEN_SEED, seller.key().as_ref(), market_item_id.to_le_bytes().as_ref()],
        bump,
        token::mint = kamino_reserve_collateral_mint,
        token::authority = unified_vault,
    )]
    pub order_ktoken_account: Box<Account<'info, TokenAccount>>,

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
    /// CHECK: the Instructions sysvar, required by Kamino's deposit instruction.
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
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

pub fn handle_fund_order_yield(ctx: Context<FundOrderYield>, _market_item_id: u64) -> Result<()> {
    require!(
        ctx.accounts.order_state.status == EscrowStatus::Initialized,
        LiminalError::InvalidState
    );

    let principal = ctx.accounts.order_state.principal_amount;
    let yield_amount = principal
        .checked_mul(YIELD_BPS)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(LiminalError::MathOverflow)?;

    // 1. Buyer's full principal into the vault's own token account, same as
    //    the non-yield path.
    let cpi_accounts = Transfer {
        from: ctx.accounts.buyer_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        principal,
    )?;

    // 2. Route `yield_amount` of it into Kamino, signed by the vault PDA
    //    (the authority of vault_token_account). Bind every AccountInfo to a
    //    local first - `KaminoReserveAccounts` borrows them, and a reference
    //    to a `.to_account_info()` temporary won't outlive this expression.
    let vault_cfg = &ctx.accounts.unified_vault;
    let mint_ai = ctx.accounts.mint.to_account_info();
    let kamino_reserve_collateral_mint_ai = ctx.accounts.kamino_reserve_collateral_mint.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let unified_vault_ai = ctx.accounts.unified_vault.to_account_info();
    let vault_token_account_ai = ctx.accounts.vault_token_account.to_account_info();
    let order_ktoken_account_ai = ctx.accounts.order_ktoken_account.to_account_info();

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
        pyth_oracle: optional_oracle(
            vault_cfg.kamino_pyth_oracle,
            &ctx.accounts.kamino_pyth_oracle,
        )?,
        switchboard_price_oracle: optional_oracle(
            vault_cfg.kamino_switchboard_price_oracle,
            &ctx.accounts.kamino_switchboard_price_oracle,
        )?,
        switchboard_twap_oracle: optional_oracle(
            vault_cfg.kamino_switchboard_twap_oracle,
            &ctx.accounts.kamino_switchboard_twap_oracle,
        )?,
        scope_prices: optional_oracle(
            vault_cfg.kamino_scope_prices,
            &ctx.accounts.kamino_scope_prices,
        )?,
    };

    kamino::refresh_reserve(&kamino)?;

    let mint_key = ctx.accounts.mint.key();
    let vault_bump = vault_cfg.bump;
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];

    kamino::deposit_reserve_liquidity(
        &kamino,
        &unified_vault_ai,
        &vault_token_account_ai,
        &order_ktoken_account_ai,
        yield_amount,
        vault_seeds,
    )?;

    // 3. Record how many kTokens this order now holds (read post-CPI balance
    //    rather than trusting a computed exchange rate).
    ctx.accounts.order_ktoken_account.reload()?;
    let k_token_shares = ctx.accounts.order_ktoken_account.amount;

    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order_state;
    let deadline = now
        .checked_add(order.delivery_window)
        .ok_or(LiminalError::MathOverflow)?;
    order.buyer = ctx.accounts.buyer.key();
    order.start_timestamp = now;
    order.delivery_deadline = deadline;
    order.status = EscrowStatus::Funded;
    order.k_token_shares = k_token_shares;

    let vault = &mut ctx.accounts.unified_vault;
    vault.total_active_principal = vault
        .total_active_principal
        .checked_add(principal)
        .ok_or(LiminalError::MathOverflow)?;

    Ok(())
}
