use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::*, state::OracleConfig};

/// One-time (per mint) setup naming the pubkey trusted to sign delivery
/// attestations for `settle_order_with_oracle`. Restricted to `authority`
/// (the caller), matching the trust model of `initialize_vault`.
#[derive(Accounts)]
pub struct InitializeOracleConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = OracleConfig::SPACE,
        seeds = [ORACLE_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_oracle_config(
    ctx: Context<InitializeOracleConfig>,
    oracle_pubkey: Pubkey,
) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    cfg.authority = ctx.accounts.authority.key();
    cfg.mint = ctx.accounts.mint.key();
    cfg.oracle_pubkey = oracle_pubkey;
    cfg.bump = ctx.bumps.oracle_config;
    Ok(())
}
