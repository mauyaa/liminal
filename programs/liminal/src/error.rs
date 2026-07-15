use anchor_lang::prelude::*;

#[error_code]
pub enum LiminalError {
    #[msg("Calculation overflow or underflow occurred.")]
    MathOverflow,
    #[msg("Order state does not permit this action.")]
    InvalidState,
    #[msg("Listing amount and delivery window must be greater than zero.")]
    InvalidListingParams,
    #[msg("The delivery deadline has not yet passed.")]
    DeadlineNotReached,
}
