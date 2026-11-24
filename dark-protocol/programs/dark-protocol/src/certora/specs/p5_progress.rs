//! Property 5 — Withdraw progress and error classification (the
//! headline property).
//!
//! Spec text: `dark-protocol_spec.md`, Property 5. Two halves:
//!
//! **Error classification** (fully specified here, in the conf'd
//! rules): every `DarkError` a `withdraw` can return is accounted
//! for — `ZeroAmount` (caller input), `UnknownRoot` (caller input),
//! `InsufficientPoolBalance` (ledger state vs. caller amount),
//! `ProofVerificationFailed` (verifier/proof), `PoseidonError`
//! (the recipient-derivation hash, an external-contract failure) —
//! and the spec's named target: **`ArithmeticOverflow` is
//! unreachable in `withdraw`** given the invariant
//! `total_withdrawn ≤ total_deposited` and the handler's check
//! order. The two checked operations are the `checked_sub` computing
//! the outstanding balance (guarded by the invariant) and the
//! `checked_add` advancing `total_withdrawn` (guarded by
//! `amount ≤ outstanding`, so the sum is at most `total_deposited`).
//! If either could fire, the first rule below produces the
//! counterexample input the spec asks for.
//!
//! **Progress** (the second rule): under the spec's conditions 1–7 a
//! valid withdraw succeeds and pays exactly `amount`. Condition 4 is
//! the A3 oracle contract — the proof *is* valid, so `verify()`
//! returns `Ok(())`. The Prover's unmodelled alt_bn128 syscalls do
//! not by themselves satisfy that contract, so this rule is
//! **A3-conditional**: it becomes provable once `verify()` carries a
//! summary faithful to A3, and it is therefore **excluded from
//! `p5_progress.conf` and `run.conf`** (both list rules explicitly).
//! It is kept in the spec file — not deleted, not weakened — as the
//! precise statement of the remaining claim, exactly as the spec's
//! "report it as boundary-limited rather than silently assuming a
//! stronger contract" instruction requires. Conditions 6's rent
//! floors are runtime facts (A4); the scenario funds the vault and
//! the recipient so the modelled transfer can succeed.

extern crate alloc;

use cvlr::prelude::*;

use super::harness::*;
use crate::{errors::DarkError, Pool};

fn pool_with_invariant() -> Pool {
    let mut pool = initialized_pool(nondet_bytes());
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    cvlr_assume!(pool.total_withdrawn <= pool.total_deposited);
    pool
}

/// 5, classification target: `ArithmeticOverflow` is unreachable in
/// `withdraw` under the ledger invariant — for arbitrary proof
/// bytes, root, nullifier, amount, recipient and balances.
#[rule]
pub fn rule_p5_arithmetic_overflow_unreachable_in_withdraw() {
    let pool = pool_with_invariant();
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet(),
    );
    cvlr_assert!(!err_is(&run.result, DarkError::ArithmeticOverflow));
}

/// 5, classification completeness: any custom (`DarkError`) failure
/// of `withdraw` is one of the five classified codes — never
/// `ZeroCommitment`, `NonCanonicalFieldElement`, `TreeFull`,
/// `ArithmeticOverflow` or `TransferNotEnabled`, none of which the
/// handler can reach. (Non-custom failures are runtime/Anchor-layer:
/// Clock retrieval, the payout CPI, account validation — origins
/// (iv)/(v) of the spec's classification.)
#[rule]
pub fn rule_p5_withdraw_error_classification() {
    let pool = pool_with_invariant();
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet(),
    );
    if let Some(code) = custom_error(&run.result) {
        cvlr_assert!(
            code == DarkError::ZeroAmount as u32 + 6000
                || code == DarkError::UnknownRoot as u32 + 6000
                || code == DarkError::InsufficientPoolBalance as u32 + 6000
                || code == DarkError::ProofVerificationFailed as u32 + 6000
                || code == DarkError::PoseidonError as u32 + 6000
        );
    } else {
        cvlr_assert!(true);
    }
}

/// 5, progress — **A3-CONDITIONAL, EXCLUDED FROM ALL CONFS** (see
/// file docs). Under conditions 1–7 of the spec (pool initialized;
/// amount in (0, outstanding]; root the pool's current root, hence
/// in the ring and non-zero; the proof valid for
/// `[root, nf, recipient_field(recipient), amount_to_field(amount)]`
/// under `VERIFYING_KEY` — the A3 contract; fresh marker, modelled
/// post-`init`; vault funded so the payout and the rent floors of
/// condition 6 hold; Clock readable), `withdraw` returns `Ok(())`,
/// writes the marker for exactly this `nf`, and pays exactly
/// `amount` from the vault to the recipient.
#[rule]
pub fn rule_p5_progress_under_oracle_contract() {
    let pool = pool_with_invariant();
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    cvlr_assume!(amount <= pool.total_deposited - pool.total_withdrawn);
    cvlr_assume!(pool.current_root != [0u8; 32]);
    let nf: [u8; 32] = nondet_bytes();
    let vault_pre: u64 = nondet();
    // Condition 6 headroom: payout plus a rent-exemption cushion for
    // the vault's zero-data account and the recipient.
    cvlr_assume!(vault_pre >= amount + 890_880);
    let recipient_pre: u64 = nondet();
    cvlr_assume!(recipient_pre >= 890_880);
    let run = run_withdraw(
        &pool,
        vault_pre,
        nondet_bytes(),
        recipient_pre,
        nondet_bytes(),
        nondet_bytes(),
        pool.current_root,
        nf,
        amount,
    );
    cvlr_assert!(run.result.is_ok());
    let marker = read_marker(&run.accounts[2]);
    cvlr_assert!(marker.nf == nf);
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre - amount);
    cvlr_assert!(lamports(&run.accounts[3]) == recipient_pre + amount);
}
