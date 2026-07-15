pub mod constants;
pub mod error;
pub mod instructions;
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

    pub fn settle_order(ctx: Context<SettleOrder>, market_item_id: u64) -> Result<()> {
        crate::instructions::settle_order::handle_settle_order(ctx, market_item_id)
    }

    pub fn refund_order(ctx: Context<RefundOrder>, market_item_id: u64) -> Result<()> {
        crate::instructions::refund_order::handle_refund_order(ctx, market_item_id)
    }
}
