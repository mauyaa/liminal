use anchor_lang::prelude::*;

use crate::{constants::*, error::LiminalError, state::{EscrowStatus, OrderState}};

/// Buyer-only: contests a signaled delivery before the challenge window
/// closes. Moves no funds - it just stops `finalize_delivery` from being
/// callable and parks the order in `Disputed`, where it stays until a
/// resolution mechanism (not built yet) moves it to `Settled` or `Refunded`.
#[derive(Accounts)]
#[instruction(market_item_id: u64)]
pub struct ChallengeOrder<'info> {
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
    pub order_state: Account<'info, OrderState>,
}

pub fn handle_challenge_order(ctx: Context<ChallengeOrder>, _market_item_id: u64) -> Result<()> {
    let order = &mut ctx.accounts.order_state;
    require!(order.status == EscrowStatus::DeliverySignaled, LiminalError::InvalidState);
    require!(
        Clock::get()?.unix_timestamp < order.challenge_deadline,
        LiminalError::ChallengeWindowExpired
    );

    order.status = EscrowStatus::Disputed;
    Ok(())
}
