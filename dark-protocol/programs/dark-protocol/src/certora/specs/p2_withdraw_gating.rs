//! Property 2 — Withdraw gating: payment only after every check,
//! marker before money.
//!
//! Spec text: `dark-protocol_spec.md`, Property 2(1)–(6). The handler's
//! check order is: (1) `amount > 0` → (2) root in history → (3) ledger
//! solvency → (4) Groth16 verification over `[root, nf, recipient,
//! amount]` with `recipient` computed by the program from the
//! recipient account → (5) payment. The rules pin the order by
//! presenting inputs that violate several gates at once and asserting
//! the *earliest* gate's error is the one returned — if a later check
//! ran first, its error (or the oracle's) would surface instead.
//!
//! The Groth16 oracle's outcome is not fixed by the rules (A3): the
//! safety content is conditional — payment effects occur only on
//! executions where every program-side gate passed *and* `verify()`
//! returned `Ok(())`; an execution whose oracle call fails
//! (`ProofVerificationFailed`) changes nothing (spec item 6: a
//! rejected proof never burns a nullifier — within the modelled
//! invocation the marker stays zero and no total moves; the
//! cross-instruction half of that claim is the runtime's rollback,
//! A6, plus precondition 1's account-creation abort).

extern crate alloc;

use cvlr::prelude::*;

use super::harness::*;
use crate::{errors::DarkError, Pool};

/// A pool whose root history contains exactly its `current_root`
/// (the post-initialize ring), with a nondeterministic ledger.
fn pool_with_ledger() -> Pool {
    let mut pool = initialized_pool(nondet_bytes());
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    cvlr_assume!(pool.total_withdrawn <= pool.total_deposited);
    pool
}

fn outstanding(pool: &Pool) -> u64 {
    pool.total_deposited - pool.total_withdrawn
}

/// 2(1) before 2(2): a zero amount is rejected with `ZeroAmount` even
/// when the root is also unknown — the amount check runs first.
#[rule]
pub fn rule_p2_zero_amount_rejected_first() {
    let pool = pool_with_ledger();
    let unknown_root: [u8; 32] = nondet_bytes();
    cvlr_assume!(unknown_root != pool.current_root);
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        unknown_root,
        nondet_bytes(),
        0,
    );
    cvlr_assert!(err_is(&run.result, DarkError::ZeroAmount));
}

/// 2(2) before 2(3) and 2(4): an unknown root is rejected with
/// `UnknownRoot` even when the amount also exceeds the ledger and the
/// proof is garbage — neither the solvency check nor the oracle is
/// reached first.
#[rule]
pub fn rule_p2_unknown_root_rejected_before_solvency_and_proof() {
    let pool = pool_with_ledger();
    let amount: u64 = nondet();
    cvlr_assume!(amount > outstanding(&pool));
    let unknown_root: [u8; 32] = nondet_bytes();
    cvlr_assume!(unknown_root != pool.current_root);
    cvlr_assume!(unknown_root != [0u8; 32]);
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        unknown_root,
        nondet_bytes(),
        amount,
    );
    cvlr_assert!(err_is(&run.result, DarkError::UnknownRoot));
}

/// The zero root is never a valid anchor (spec 6a cross-check at the
/// withdraw gate): `RootHistory::contains` rejects `[0u8; 32]`
/// unconditionally.
#[rule]
pub fn rule_p2_zero_root_always_rejected() {
    let pool = pool_with_ledger();
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    cvlr_assume!(amount <= outstanding(&pool));
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        [0u8; 32],
        nondet_bytes(),
        amount,
    );
    cvlr_assert!(err_is(&run.result, DarkError::UnknownRoot));
}

/// 2(6). An execution rejected by the oracle
/// (`ProofVerificationFailed`) pays nothing and burns nothing: pool
/// state byte-identical, marker still the zero marker, vault and
/// recipient lamports untouched.
#[rule]
pub fn rule_p2_rejected_proof_pays_nothing_and_burns_nothing() {
    let pool = pool_with_ledger();
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    cvlr_assume!(amount <= outstanding(&pool));
    let nf: [u8; 32] = nondet_bytes();
    let vault_pre: u64 = nondet();
    let recipient_pre: u64 = nondet();
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
    if err_is(&run.result, DarkError::ProofVerificationFailed) {
        cvlr_assert!(pool_eq(&run.pool(), &pool));
        let marker = read_marker(&run.accounts[2]);
        cvlr_assert!(marker.nf == [0u8; 32]);
        cvlr_assert!(marker.slot == 0);
        cvlr_assert!(lamports(&run.accounts[1]) == vault_pre);
        cvlr_assert!(lamports(&run.accounts[3]) == recipient_pre);
    } else {
        // Any other outcome is one of the classified results
        // (success under the oracle contract, or a Poseidon error
        // from the recipient derivation — property 5's rule pins the
        // full classification); this rule's claim is conditional on
        // the rejection branch.
        cvlr_assert!(true);
    }
}

/// 2(4)+(5), success direction. On an execution where `withdraw`
/// returns `Ok(())` — which by the handler's control flow means every
/// gate passed and the oracle accepted the proof for
/// `[root, nf, recipient_field(recipient), amount]` — the marker
/// records exactly this `nf` under its canonical bump, the ledger
/// advances by exactly `amount`, and (A4-conditional) the vault pays
/// exactly `amount` to the recipient account and to no one else: the
/// fee payer's balance is untouched.
#[rule]
pub fn rule_p2_success_writes_marker_and_pays_recipient_exactly() {
    let pool = pool_with_ledger();
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    cvlr_assume!(amount <= outstanding(&pool));
    let nf: [u8; 32] = nondet_bytes();
    let vault_pre: u64 = nondet();
    let recipient_pre: u64 = nondet();
    cvlr_assume!(vault_pre >= amount);
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
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    cvlr_assert!(post.total_withdrawn == pool.total_withdrawn + amount);
    cvlr_assert!(post.total_deposited == pool.total_deposited);
    let marker = read_marker(&run.accounts[2]);
    cvlr_assert!(marker.nf == nf);
    cvlr_assert!(marker.bump == marker_pda(&nf).1);
    // A4-conditional lamport effects of the step-(5) transfer.
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre - amount);
    cvlr_assert!(lamports(&run.accounts[3]) == recipient_pre + amount);
    cvlr_assert!(lamports(&run.accounts[4]) == SOME_LAMPORTS);
}
