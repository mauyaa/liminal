use anchor_lang::prelude::*;

/// Global, per-mint escrow custody account. One `UnifiedVault` holds every
/// buyer's in-escrow principal for a given stablecoin mint, so orders don't
/// each need their own token account.
///
/// When `yield_enabled` is true, the `kamino_*` fields configure a specific
/// Kamino Lend reserve that `fund_order_yield`/`settle_order_yield`/
/// `refund_order_yield` route 75% of each order's principal through. These
/// fields are trusted admin input (set once, by the vault's `authority`) -
/// Kamino's own program independently validates them on every CPI, so a
/// misconfigured value fails the CPI atomically rather than misdirecting
/// funds.
#[account]
pub struct UnifiedVault {
    pub authority: Pubkey,           // 32: admin that initialized this vault
    pub mint: Pubkey,                // 32: accepted stablecoin mint
    pub token_vault: Pubkey,         // 32: PDA-owned token account holding custody
    pub total_active_principal: u64, // 8: sum of principal across all Funded orders
    pub yield_enabled: bool,         // 1
    pub kamino_program: Pubkey,                 // 32
    pub kamino_lending_market: Pubkey,          // 32
    pub kamino_lending_market_authority: Pubkey, // 32
    pub kamino_reserve: Pubkey,                 // 32
    pub kamino_reserve_liquidity_supply: Pubkey, // 32
    pub kamino_reserve_collateral_mint: Pubkey, // 32: the reserve's kToken mint
    pub kamino_pyth_oracle: Pubkey,             // 32: Pubkey::default() if unused
    pub kamino_switchboard_price_oracle: Pubkey, // 32: Pubkey::default() if unused
    pub kamino_switchboard_twap_oracle: Pubkey, // 32: Pubkey::default() if unused
    pub kamino_scope_prices: Pubkey,            // 32: Pubkey::default() if unused
    pub bump: u8,                    // 1
}

impl UnifiedVault {
    pub const SPACE: usize = 8 // discriminator
        + 32 + 32 + 32 + 8 + 1
        + 32 * 10
        + 1;
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
    pub k_token_shares: u64,     // 8: this order's Kamino collateral (kToken) balance,
                                  //    0 unless yield_enabled and currently Funded
    pub bump: u8,                // 1
}

impl OrderState {
    pub const SPACE: usize = 8 // discriminator
        + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    Initialized,
    Funded,
    Settled,
    Refunded,
}
