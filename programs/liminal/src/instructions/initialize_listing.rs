use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::*, error::LiminalError, state::{EscrowStatus, OrderState}};

#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct InitializeListing<'info> {
    /// Pays the listing's one-time rent - the seller themselves, or a
    /// sponsor (e.g. a relayer) covering it so a seller with zero SOL can
    /// still create a listing. Kept distinct from `seller` so sponsoring
    /// never requires impersonating the seller's own signature; the same
    /// key can fill both roles for a self-funded listing (one signature
    /// satisfies both Signer constraints).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Must still sign to authorize creating a listing under their own
    /// identity, regardless of who pays the rent.
    pub seller: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = OrderState::SPACE,
        seeds = [ORDER_SEED, seller.key().as_ref(), market_item_id.to_le_bytes().as_ref()],
        bump
    )]
    pub order_state: Account<'info, OrderState>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_listing(
    ctx: Context<InitializeListing>,
    market_item_id: u64,
    amount: u64,
    delivery_window: i64,
) -> Result<()> {
    require!(amount > 0 && delivery_window > 0, LiminalError::InvalidListingParams);

    let order = &mut ctx.accounts.order_state;
    order.seller = ctx.accounts.seller.key();
    order.buyer = Pubkey::default();
    order.mint = ctx.accounts.mint.key();
    order.principal_amount = amount;
    order.market_item_id = market_item_id;
    order.start_timestamp = 0;
    order.delivery_window = delivery_window;
    order.delivery_deadline = 0;
    order.status = EscrowStatus::Initialized;
    order.bump = ctx.bumps.order_state;
    Ok(())
}
