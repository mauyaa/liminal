pub mod constants;
pub mod error;
pub mod instructions;
pub mod kamino;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD");

#[program]
pub mod liminal {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        crate::instructions::initialize_vault::handle_initialize_vault(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn initialize_vault_yield(
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
        crate::instructions::initialize_vault_yield::handle_initialize_vault_yield(
            ctx,
            kamino_lending_market,
            kamino_reserve,
            kamino_lending_market_authority,
            kamino_reserve_liquidity_supply,
            kamino_reserve_collateral_mint,
            kamino_pyth_oracle,
            kamino_switchboard_price_oracle,
            kamino_switchboard_twap_oracle,
            kamino_scope_prices,
        )
    }

    pub fn initialize_listing(
        ctx: Context<InitializeListing>,
        market_item_id: u64,
        amount: u64,
        delivery_window: i64,
    ) -> Result<()> {
        crate::instructions::initialize_listing::handle_initialize_listing(
            ctx,
            market_item_id,
            amount,
            delivery_window,
        )
    }

    pub fn fund_order(ctx: Context<FundOrder>, market_item_id: u64) -> Result<()> {
        crate::instructions::fund_order::handle_fund_order(ctx, market_item_id)
    }

    pub fn fund_order_yield(ctx: Context<FundOrderYield>, market_item_id: u64) -> Result<()> {
        crate::instructions::fund_order_yield::handle_fund_order_yield(ctx, market_item_id)
    }

    pub fn settle_order(ctx: Context<SettleOrder>, market_item_id: u64) -> Result<()> {
        crate::instructions::settle_order::handle_settle_order(ctx, market_item_id)
    }

    pub fn settle_order_yield(ctx: Context<SettleOrderYield>, market_item_id: u64) -> Result<()> {
        crate::instructions::settle_order_yield::handle_settle_order_yield(ctx, market_item_id)
    }

    pub fn refund_order(ctx: Context<RefundOrder>, market_item_id: u64) -> Result<()> {
        crate::instructions::refund_order::handle_refund_order(ctx, market_item_id)
    }

    pub fn refund_order_yield(ctx: Context<RefundOrderYield>, market_item_id: u64) -> Result<()> {
        crate::instructions::refund_order_yield::handle_refund_order_yield(ctx, market_item_id)
    }
}
