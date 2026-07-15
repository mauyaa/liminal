use anchor_lang::prelude::*;

/// Global, per-mint escrow custody account. One `UnifiedVault` holds every
/// buyer's in-escrow principal for a given stablecoin mint, so orders don't
/// each need their own token account.
#[account]
pub struct UnifiedVault {
    pub authority: Pubkey,           // 32: admin that initialized this vault
    pub mint: Pubkey,                // 32: accepted stablecoin mint
    pub token_vault: Pubkey,         // 32: PDA-owned token account holding custody
    pub total_active_principal: u64, // 8: sum of principal across all Funded orders
    pub bump: u8,                    // 1
}

impl UnifiedVault {
    pub const SPACE: usize = 8 // discriminator
        + 32 + 32 + 32 + 8 + 1;
}

/// A single merchant listing / order. Created by the seller, funded by the
/// buyer, then resolved by either settlement (buyer confirms) or timeout
/// refund (deadline passes while still `Funded`).
#[account]
pub struct OrderState {
    pub seller: Pubkey,          // 32
    pub buyer: Pubkey,           // 32: Pubkey::default() until funded
    pub mint: Pubkey,            // 32
    pub principal_amount: u64,   // 8: amount due to seller on settlement
    pub market_item_id: u64,     // 8: seller-chosen SKU/id, part of the PDA seed
    pub start_timestamp: i64,    // 8: set when funded, 0 before that
    pub delivery_window: i64,    // 8: seconds, set at listing creation
    pub delivery_deadline: i64,  // 8: start_timestamp + delivery_window, 0 before funded
    pub status: EscrowStatus,    // 1
    pub bump: u8,                // 1
}

impl OrderState {
    pub const SPACE: usize = 8 // discriminator
        + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    Initialized,
    Funded,
    Settled,
    Refunded,
}
