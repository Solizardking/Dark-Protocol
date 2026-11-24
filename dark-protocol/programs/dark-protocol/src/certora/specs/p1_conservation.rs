//! Property 1 — Lamport conservation and ledger integrity.
//!
//! Spec text: `dark-protocol_spec.md`, Property 1(a)–(e). The ledger
//! claims (a)–(c) are about state the program itself writes — the
//! `Pool` totals — and are proven unconditionally (modulo A1/A6). The
//! lamport-movement claims (d) and the vault-balance half of (c) ride
//! on the System Program's transfer contract and are marked
//! A4-conditional where they appear.
//!
//! Per-instruction rules compose into the spec's sequence claim: each
//! rule quantifies over one instruction from an arbitrary state
//! satisfying the invariant `total_withdrawn ≤ total_deposited`, and
//! shows the instruction preserves it and updates the totals exactly
//! as (a) states — induction over the instruction sequence is then
//! immediate. Claim (c)'s "donations can never make an invalid
//! withdrawal valid" is the conjunction of rule_p1c (the ledger check
//! reads only the totals, never the vault balance) and property 2's
//! solvency rule, which is stated against the totals alone.

extern crate alloc;

use cvlr::prelude::*;

use super::harness::*;
use crate::{errors::DarkError, Pool};

/// A pool state satisfying the ledger invariant, with nondeterministic
/// totals / leaf index / ring contents.
fn pool_with_invariant() -> Pool {
    let mut pool = initialized_pool(nondet_bytes());
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    cvlr_assume!(pool.total_withdrawn <= pool.total_deposited);
    pool.next_leaf_index = nondet();
    cvlr_assume!(pool.next_leaf_index < crate::merkle::MAX_LEAVES);
    pool
}

/// 1a-deposit. A successful `deposit` increases `total_deposited` by
/// exactly `amount` and changes no other total.
#[rule]
pub fn rule_p1_deposit_updates_totals_exactly() {
    let pool = pool_with_invariant();
    let amount: u64 = nondet();
    let cm: [u8; 32] = nondet_bytes();
    cvlr_assume!(amount > 0);
    cvlr_assume!(cm != [0u8; 32]);
    cvlr_assume!(crate::poseidon::is_canonical_field_element(&cm));
    let depositor: [u8; 32] = nondet_bytes();
    let run = run_deposit(&pool, nondet(), depositor, nondet(), amount, cm);
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    cvlr_assert!(post.total_deposited == pool.total_deposited + amount);
    cvlr_assert!(post.total_withdrawn == pool.total_withdrawn);
}

/// 1a-withdraw. A successful `withdraw` increases `total_withdrawn` by
/// exactly `amount` and changes no other total.
#[rule]
pub fn rule_p1_withdraw_updates_totals_exactly() {
    let pool = pool_with_invariant();
    let amount: u64 = nondet();
    let run = run_withdraw(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        amount,
    );
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    cvlr_assert!(post.total_withdrawn == pool.total_withdrawn + amount);
    cvlr_assert!(post.total_deposited == pool.total_deposited);
}

/// 1b. The invariant `total_withdrawn ≤ total_deposited` is preserved
/// by every handler, success or failure.
#[rule]
pub fn rule_p1_invariant_preserved_by_all_handlers() {
    let pool = pool_with_invariant();
    let which: u8 = nondet();
    let post = match which % 3 {
        0 => run_deposit(&pool, nondet(), nondet_bytes(), nondet(), nondet(), nondet_bytes()).pool(),
        1 => run_withdraw(
            &pool,
            nondet(),
            nondet_bytes(),
            nondet(),
            nondet_bytes(),
            nondet_bytes(),
            nondet_bytes(),
            nondet_bytes(),
            nondet(),
        )
        .pool(),
        _ => run_transfer(&pool, nondet_bytes()).pool(),
    };
    cvlr_assert!(post.total_withdrawn <= post.total_deposited);
}

/// 1c. The solvency gate reads only the ledger: for a fixed pool state
/// and amount above the outstanding ledger balance, `withdraw` is
/// rejected with `InsufficientPoolBalance` no matter how many lamports
/// the vault holds (a donation cannot inflate the ledger). The
/// vault-lamports value is fully nondeterministic here — including
/// balances far above the ledger total.
#[rule]
pub fn rule_p1_donations_do_not_inflate_ledger() {
    let pool = pool_with_invariant();
    let amount: u64 = nondet();
    let outstanding = pool.total_deposited - pool.total_withdrawn;
    cvlr_assume!(amount > outstanding);
    // Anchor the proof to a root the pool produced, so the solvency
    // check (step 3) is the first gate that can fire.
    let root = pool.current_root;
    let run = run_withdraw(
        &pool,
        nondet(), // vault lamports: arbitrary, donation-inflated or not
        nondet_bytes(),
        nondet(),
        nondet_bytes(),
        nondet_bytes(),
        root,
        nondet_bytes(),
        amount,
    );
    cvlr_assert!(err_is(&run.result, DarkError::InsufficientPoolBalance));
}

/// 1d (A4-conditional). A successful `deposit` moves exactly `amount`
/// lamports from the depositor to the vault: the vault gains exactly
/// `amount`, the depositor loses exactly `amount`, and the payment is
/// the handler's single transfer CPI, of the same `amount` the leaf is
/// bound to (property 3c).
#[rule]
pub fn rule_p1_deposit_moves_exactly_amount() {
    let pool = pool_with_invariant();
    let amount: u64 = nondet();
    let cm: [u8; 32] = nondet_bytes();
    cvlr_assume!(amount > 0);
    cvlr_assume!(cm != [0u8; 32]);
    cvlr_assume!(crate::poseidon::is_canonical_field_element(&cm));
    let vault_pre: u64 = nondet();
    let depositor_pre: u64 = nondet();
    cvlr_assume!(depositor_pre >= amount);
    let run = run_deposit(&pool, vault_pre, nondet_bytes(), depositor_pre, amount, cm);
    cvlr_assume!(run.result.is_ok());
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre + amount);
    cvlr_assert!(lamports(&run.accounts[2]) == depositor_pre - amount);
}

/// 1e + atomicity. `transfer` always returns `TransferNotEnabled`,
/// changes no `Pool` field, and moves no lamports; and any *failed*
/// instruction (any handler) leaves the pool state byte-identical —
/// the modelled half of the runtime's rollback guarantee (A6).
#[rule]
pub fn rule_p1_transfer_moves_nothing_and_failures_are_atomic() {
    let pool = pool_with_invariant();
    let run = run_transfer(&pool, nondet_bytes());
    cvlr_assert!(err_is(&run.result, DarkError::TransferNotEnabled));
    let post = run.pool();
    cvlr_assert!(pool_eq(&post, &pool));
    cvlr_assert!(lamports(&run.accounts[0]) == SOME_LAMPORTS);
}

/// Atomicity for the value-moving handlers: if `deposit` or
/// `withdraw` returns an error, the pool state is unchanged (within
/// the modelled invocation; cross-instruction rollback is the
/// runtime's, A6).
#[rule]
pub fn rule_p1_failed_value_handlers_change_no_pool_state() {
    let pool = pool_with_invariant();
    let dep = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), nondet(), nondet_bytes());
    if dep.result.is_err() {
        cvlr_assert!(pool_eq(&dep.pool(), &pool));
    }
    let wd = run_withdraw(
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
    if wd.result.is_err() {
        cvlr_assert!(pool_eq(&wd.pool(), &pool));
    }
}
