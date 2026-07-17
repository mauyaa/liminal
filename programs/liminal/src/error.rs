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
    #[msg("This vault was not configured for Kamino yield routing.")]
    YieldNotEnabled,
    #[msg("Settlement requires a preceding Ed25519 signature-verification instruction in the same transaction.")]
    MissingOracleAttestation,
    #[msg("The oracle attestation's signed message did not match this order and delivery status.")]
    InvalidOracleAttestation,
    #[msg("The attestation was signed by a key other than this vault's configured oracle.")]
    UntrustedOracle,
    #[msg("The challenge window has already closed.")]
    ChallengeWindowExpired,
    #[msg("The challenge window has not elapsed yet.")]
    ChallengeWindowNotElapsed,
}
