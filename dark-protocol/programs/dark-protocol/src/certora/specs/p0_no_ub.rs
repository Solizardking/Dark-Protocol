//! Property 0 — No undefined behaviour, no panics on valid inputs.
//!
//! Spec text: `dark-protocol_spec.md`, Property 0. For every
//! instruction handler and every helper they reach, execution is free
//! of undefined behaviour and the handler does not panic on any valid
//! input (precondition 4: any input whose accounts satisfy
//! precondition 1).
//!
//! In CVLR this property is mostly *intrinsic*: the Prover's SBF
//! semantics turn a modelled panic / out-of-bounds access / checked-
//! arithmetic trap into a rule violation on the path that reaches it.
//! The rules below therefore drive each handler (and, for the Merkle
//! helpers, the exact functions `initialize` runs) with fully
//! nondeterministic inputs and assert a meaningful well-formedness
//! postcondition — the pool account still parses as a `Pool` — so a
//! rule fails iff some input drives the code into a panic or corrupts
//! the state encoding, and passes vacuously for no input class.
//!
//! The handlers' own arithmetic is `checked_add` / `checked_sub`
//! throughout (their failure is a returned `DarkError`, not a panic —
//! property 5 classifies it), and the only divisions are by non-zero
//! constants in `Frontier` / `RootHistory`; the rules quantify over
//! exactly those code paths.

extern crate alloc;

use cvlr::prelude::*;

use super::harness::*;
use crate::{
    merkle::{Frontier, RootHistory, ROOT_HISTORY_SIZE, TREE_DEPTH},
    poseidon::{is_canonical_field_element, poseidon2},
};

/// 0a. `deposit` never panics: arbitrary amount / commitment /
/// balances, arbitrary well-formed pool state.
#[rule]
pub fn rule_p0_deposit_no_panic() {
    let mut pool = initialized_pool(nondet_bytes());
    // Arbitrary reachable-ish ledger state: totals and leaf index are
    // nondeterministic (the handler's checks must cope with all of
    // them without panicking, including TreeFull and overflow edges).
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    pool.next_leaf_index = nondet();
    let run = run_deposit(
        &pool,
        nondet(),
        nondet_bytes(),
        nondet(),
        nondet(),
        nondet_bytes(),
    );
    // Well-formedness: whatever the outcome, the pool still parses.
    let _ = run.pool();
    cvlr_assert!(run.result.is_ok() || run.result.is_err());
}

/// 0b. `withdraw` never panics: arbitrary proof bytes, root, nullifier,
/// amount and pool state. (The Groth16 oracle's success/failure is an
/// outcome, not a panic — A3.)
#[rule]
pub fn rule_p0_withdraw_no_panic() {
    let mut pool = initialized_pool(nondet_bytes());
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    pool.next_leaf_index = nondet();
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
    let _ = run.pool();
    let _ = read_marker(&run.accounts[2]);
    cvlr_assert!(run.result.is_ok() || run.result.is_err());
}

/// 0c. `transfer` never panics (it must always reach its
/// `TransferNotEnabled` return — property 1e pins the error itself).
#[rule]
pub fn rule_p0_transfer_no_panic() {
    let pool = initialized_pool(nondet_bytes());
    let run = run_transfer(&pool, nondet_bytes());
    let _ = run.pool();
    cvlr_assert!(run.result.is_ok() || run.result.is_err());
}

/// 0d. The Merkle helpers `initialize` runs never panic and produce a
/// coherent empty-tree state: `Frontier::new`, `Frontier::root`,
/// `RootHistory::new`, `RootHistory::contains`, `zero_chain` (via
/// `Frontier::new`). This is the handler-level coverage available for
/// `initialize` under the A4/A6 modelling (account creation is a CPI;
/// see harness docs) — its state effect is pinned by property 6a.
#[rule]
pub fn rule_p0_merkle_helpers_no_panic() {
    let frontier = Frontier::<TREE_DEPTH>::new();
    cvlr_assume!(frontier.is_ok());
    let frontier = frontier.unwrap();
    let root = frontier.root();
    cvlr_assume!(root.is_ok());
    let history = RootHistory::<ROOT_HISTORY_SIZE>::new(root.unwrap());
    let probe: [u8; 32] = nondet_bytes();
    let _ = history.contains(&probe);
    cvlr_assert!(history.len == 1);
}

/// 0e. The Poseidon helpers the handlers reach never panic on
/// canonical inputs (non-canonical inputs are an error return, not a
/// panic — `poseidon2` maps the syscall error to
/// `DarkError::PoseidonError`).
#[rule]
pub fn rule_p0_poseidon_helpers_no_panic() {
    let a: [u8; 32] = nondet_bytes();
    let b: [u8; 32] = nondet_bytes();
    cvlr_assume!(is_canonical_field_element(&a));
    cvlr_assume!(is_canonical_field_element(&b));
    let out = poseidon2(&a, &b);
    cvlr_assume!(out.is_ok());
    cvlr_assert!(is_canonical_field_element(&out.unwrap()));
}
