use anchor_lang::prelude::*;

#[error_code]
pub enum DarkError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Commitment must not be the zero field element")]
    ZeroCommitment,
    #[msg("Value is not a canonical BN254 field element encoding")]
    NonCanonicalFieldElement,
    #[msg("Merkle tree is full")]
    TreeFull,
    #[msg("Merkle root is not in the pool's root history")]
    UnknownRoot,
    #[msg("Pool ledger balance does not cover this withdrawal")]
    InsufficientPoolBalance,
    #[msg("Groth16 proof verification failed")]
    ProofVerificationFailed,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Poseidon hashing failed")]
    PoseidonError,
    #[msg("Shielded transfer is not enabled in v1: the transfer circuit and its verifying key have not been delivered by the ZK track")]
    TransferNotEnabled,
}
