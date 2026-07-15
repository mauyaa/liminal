//! Hand-built CPI bindings for the subset of Kamino Lend (klend) needed to
//! park escrowed principal in a reserve for yield and redeem it later.
//!
//! There is no official Rust crate for CPI-ing into klend from another
//! Anchor program that's compatible with this workspace's anchor-lang
//! version, so these are built directly against klend's account structs and
//! discriminators, cross-verified against the program's published
//! TypeScript SDK (`@kamino-finance/klend-sdk`) - not guessed. See
//! docs/kamino-integration.md for the verification trail.
//!
//! Deliberately NOT using the higher-level obligation/borrow instructions -
//! `deposit_reserve_liquidity` / `redeem_reserve_collateral` are the
//! "just earn yield, no borrowing" primitive, matching what an escrow needs.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

const REFRESH_RESERVE_DISCRIMINATOR: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DEPOSIT_RESERVE_LIQUIDITY_DISCRIMINATOR: [u8; 8] = [169, 201, 30, 126, 6, 205, 102, 68];
const REDEEM_RESERVE_COLLATERAL_DISCRIMINATOR: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Accounts common to every Kamino CPI call here, all sourced from the
/// calling `UnifiedVault`'s stored (admin-verified) Kamino configuration.
pub struct KaminoReserveAccounts<'a, 'info> {
    pub kamino_program: &'a AccountInfo<'info>,
    pub reserve: &'a AccountInfo<'info>,
    pub lending_market: &'a AccountInfo<'info>,
    pub lending_market_authority: &'a AccountInfo<'info>,
    pub reserve_liquidity_mint: &'a AccountInfo<'info>,
    pub reserve_liquidity_supply: &'a AccountInfo<'info>,
    pub reserve_collateral_mint: &'a AccountInfo<'info>,
    pub collateral_token_program: &'a AccountInfo<'info>,
    pub liquidity_token_program: &'a AccountInfo<'info>,
    pub instructions_sysvar: &'a AccountInfo<'info>,
    pub pyth_oracle: Option<&'a AccountInfo<'info>>,
    pub switchboard_price_oracle: Option<&'a AccountInfo<'info>>,
    pub switchboard_twap_oracle: Option<&'a AccountInfo<'info>>,
    pub scope_prices: Option<&'a AccountInfo<'info>>,
}

/// `refresh_reserve` - required immediately before deposit/redeem in the
/// same transaction so Kamino's interest/price state isn't stale.
///
/// Anchor represents an absent `Option<AccountInfo>` in the account list by
/// substituting the *calling program's own id* as a sentinel (see
/// anchor-lang's `accounts/option.rs`, confirmed against klend-sdk's
/// compiled `refreshReserve.js`), so unused oracle slots get the Kamino
/// program's own id, not a zero/default pubkey.
pub fn refresh_reserve(k: &KaminoReserveAccounts) -> Result<()> {
    let none_sentinel = k.kamino_program.key();
    let pyth = k.pyth_oracle.map(|a| a.key()).unwrap_or(none_sentinel);
    let sb_price = k
        .switchboard_price_oracle
        .map(|a| a.key())
        .unwrap_or(none_sentinel);
    let sb_twap = k
        .switchboard_twap_oracle
        .map(|a| a.key())
        .unwrap_or(none_sentinel);
    let scope = k.scope_prices.map(|a| a.key()).unwrap_or(none_sentinel);

    let ix = Instruction {
        program_id: k.kamino_program.key(),
        accounts: vec![
            AccountMeta::new(k.reserve.key(), false),
            AccountMeta::new_readonly(k.lending_market.key(), false),
            AccountMeta::new_readonly(pyth, false),
            AccountMeta::new_readonly(sb_price, false),
            AccountMeta::new_readonly(sb_twap, false),
            AccountMeta::new_readonly(scope, false),
        ],
        data: REFRESH_RESERVE_DISCRIMINATOR.to_vec(),
    };

    let mut infos: Vec<AccountInfo> = vec![k.reserve.clone(), k.lending_market.clone()];
    for opt in [
        k.pyth_oracle,
        k.switchboard_price_oracle,
        k.switchboard_twap_oracle,
        k.scope_prices,
    ] {
        infos.push(opt.cloned().unwrap_or_else(|| k.kamino_program.clone()));
    }
    infos.push(k.kamino_program.clone());

    anchor_lang::solana_program::program::invoke(&ix, &infos)?;
    Ok(())
}

/// `deposit_reserve_liquidity`: transfers `amount` of the underlying token
/// from `source_liquidity` into the reserve, minting the resulting kTokens
/// into `destination_collateral`. `owner` must sign and must be the
/// authority of `source_liquidity` - callers sign this via `invoke_signed`
/// with their own PDA seeds.
#[allow(clippy::too_many_arguments)]
pub fn deposit_reserve_liquidity<'info>(
    k: &KaminoReserveAccounts<'_, 'info>,
    owner: &AccountInfo<'info>,
    source_liquidity: &AccountInfo<'info>,
    destination_collateral: &AccountInfo<'info>,
    amount: u64,
    owner_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = DEPOSIT_RESERVE_LIQUIDITY_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: k.kamino_program.key(),
        accounts: vec![
            AccountMeta::new(owner.key(), true),
            AccountMeta::new(k.reserve.key(), false),
            AccountMeta::new_readonly(k.lending_market.key(), false),
            AccountMeta::new_readonly(k.lending_market_authority.key(), false),
            AccountMeta::new_readonly(k.reserve_liquidity_mint.key(), false),
            AccountMeta::new(k.reserve_liquidity_supply.key(), false),
            AccountMeta::new(k.reserve_collateral_mint.key(), false),
            AccountMeta::new(source_liquidity.key(), false),
            AccountMeta::new(destination_collateral.key(), false),
            AccountMeta::new_readonly(k.collateral_token_program.key(), false),
            AccountMeta::new_readonly(k.liquidity_token_program.key(), false),
            AccountMeta::new_readonly(k.instructions_sysvar.key(), false),
        ],
        data,
    };

    let infos: Vec<AccountInfo> = vec![
        owner.clone(),
        k.reserve.clone(),
        k.lending_market.clone(),
        k.lending_market_authority.clone(),
        k.reserve_liquidity_mint.clone(),
        k.reserve_liquidity_supply.clone(),
        k.reserve_collateral_mint.clone(),
        source_liquidity.clone(),
        destination_collateral.clone(),
        k.collateral_token_program.clone(),
        k.liquidity_token_program.clone(),
        k.instructions_sysvar.clone(),
        k.kamino_program.clone(),
    ];

    invoke_signed(&ix, &infos, &[owner_seeds])?;
    Ok(())
}

/// `redeem_reserve_collateral`: burns `amount` of kTokens from
/// `source_collateral`, returning the current underlying value (principal +
/// accrued yield, per Kamino's own exchange-rate math) into
/// `destination_liquidity`. `owner` must sign and must be the authority of
/// `source_collateral`.
#[allow(clippy::too_many_arguments)]
pub fn redeem_reserve_collateral<'info>(
    k: &KaminoReserveAccounts<'_, 'info>,
    owner: &AccountInfo<'info>,
    source_collateral: &AccountInfo<'info>,
    destination_liquidity: &AccountInfo<'info>,
    amount: u64,
    owner_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = REDEEM_RESERVE_COLLATERAL_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: k.kamino_program.key(),
        accounts: vec![
            AccountMeta::new(owner.key(), true),
            AccountMeta::new_readonly(k.lending_market.key(), false),
            AccountMeta::new(k.reserve.key(), false),
            AccountMeta::new_readonly(k.lending_market_authority.key(), false),
            AccountMeta::new_readonly(k.reserve_liquidity_mint.key(), false),
            AccountMeta::new(k.reserve_collateral_mint.key(), false),
            AccountMeta::new(k.reserve_liquidity_supply.key(), false),
            AccountMeta::new(source_collateral.key(), false),
            AccountMeta::new(destination_liquidity.key(), false),
            AccountMeta::new_readonly(k.collateral_token_program.key(), false),
            AccountMeta::new_readonly(k.liquidity_token_program.key(), false),
            AccountMeta::new_readonly(k.instructions_sysvar.key(), false),
        ],
        data,
    };

    let infos: Vec<AccountInfo> = vec![
        owner.clone(),
        k.lending_market.clone(),
        k.reserve.clone(),
        k.lending_market_authority.clone(),
        k.reserve_liquidity_mint.clone(),
        k.reserve_collateral_mint.clone(),
        k.reserve_liquidity_supply.clone(),
        source_collateral.clone(),
        destination_liquidity.clone(),
        k.collateral_token_program.clone(),
        k.liquidity_token_program.clone(),
        k.instructions_sysvar.clone(),
        k.kamino_program.clone(),
    ];

    invoke_signed(&ix, &infos, &[owner_seeds])?;
    Ok(())
}
