//! Property 3 — Deposit binding: the inserted leaf commits to the
//! lamports actually pulled (the NEW-1 property).
//!
//! Spec text: `dark-protocol_spec.md`, Property 3(a)–(d). This is the
//! audit finding NEW-1 as a theorem: `deposit(amount, cm)` inserts
//! exactly `leaf = poseidon2(cm, amount_to_field(amount))` — computed
//! by the program from its own instruction arguments — at the pool's
//! next leaf index, and the `amount` bound into the leaf is the amount
//! of the same instruction's transfer CPI. Under A2 (Poseidon
//! collision resistance, `axioms.rs`), a 1-lamport deposit can never
//! produce the leaf a withdraw proof for a larger amount opens.
//!
//! The first-deposit rules read the inserted leaf back *directly*:
//! inserting at index 0 stashes the leaf itself in `frontier[0]`
//! (the frontier's level-0 slot holds the most recent complete
//! height-0 subtree — the leaf). The second-deposit rule pins the
//! level-1 stash to `poseidon2(leaf1, leaf2)` and the root to the
//! independent reference evaluation (property 6c machinery), so the
//! binding is checked through the tree, not only at the stash.
//!
//! This file is the suite's first cloud-submission target
//! (`confs/p3_deposit_binding.conf`).

extern crate alloc;

use alloc::vec::Vec;
use cvlr::prelude::*;

use super::axioms::assume_distinct_bound_leaves;
use super::harness::*;
use crate::{
    errors::DarkError,
    poseidon::{amount_to_field, is_canonical_field_element, poseidon2},
};

/// A canonical, non-zero commitment (the shape `deposit` accepts).
fn valid_cm() -> [u8; 32] {
    let cm: [u8; 32] = nondet_bytes();
    cvlr_assume!(cm != [0u8; 32]);
    cvlr_assume!(is_canonical_field_element(&cm));
    cm
}

/// The BN254 scalar field modulus, big-endian — the smallest
/// non-canonical 32-byte value (from the program's own poseidon
/// tests). `is_canonical_field_element` rejects it deterministically
/// (a pure byte comparison; no syscall is involved).
const FR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// 3(a), amount gate: `amount == 0` is rejected with `ZeroAmount`
/// before any state change or transfer.
#[rule]
pub fn rule_p3_zero_amount_rejected_before_any_effect() {
    let pool = initialized_pool(nondet_bytes());
    let cm = valid_cm();
    let vault_pre: u64 = nondet();
    let depositor_pre: u64 = nondet();
    let run = run_deposit(&pool, vault_pre, nondet_bytes(), depositor_pre, 0, cm);
    cvlr_assert!(err_is(&run.result, DarkError::ZeroAmount));
    cvlr_assert!(pool_eq(&run.pool(), &pool));
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre);
    cvlr_assert!(lamports(&run.accounts[2]) == depositor_pre);
}

/// 3(a), commitment gate: `cm == 0` is rejected with `ZeroCommitment`
/// before any state change or transfer.
#[rule]
pub fn rule_p3_zero_commitment_rejected_before_any_effect() {
    let pool = initialized_pool(nondet_bytes());
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, [0u8; 32]);
    cvlr_assert!(err_is(&run.result, DarkError::ZeroCommitment));
    cvlr_assert!(pool_eq(&run.pool(), &pool));
}

/// 3(a), canonicality gate: a non-canonical `cm` is rejected with
/// `NonCanonicalFieldElement` before any state change or transfer.
#[rule]
pub fn rule_p3_noncanonical_commitment_rejected_before_any_effect() {
    let pool = initialized_pool(nondet_bytes());
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, FR_MODULUS);
    cvlr_assert!(err_is(&run.result, DarkError::NonCanonicalFieldElement));
    cvlr_assert!(pool_eq(&run.pool(), &pool));
}

/// 3(a), capacity gate: a full tree is rejected with `TreeFull`, pool
/// unchanged. (The handler computes the bound leaf before this check;
/// under A1 that computation succeeds for a canonical `cm`, so
/// `TreeFull` is the error that surfaces.)
#[rule]
pub fn rule_p3_tree_full_rejected() {
    let mut pool = initialized_pool(nondet_bytes());
    pool.next_leaf_index = crate::merkle::MAX_LEAVES;
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let cm = valid_cm();
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, cm);
    cvlr_assert!(err_is(&run.result, DarkError::TreeFull));
    cvlr_assert!(pool_eq(&run.pool(), &pool));
}

/// 3(b)+(d), the binding itself: a successful first deposit inserts
/// exactly `poseidon2(cm, amount_to_field(amount))` at leaf index 0 —
/// read back directly from `frontier[0]` — and advances the leaf
/// index from 0 to 1.
#[rule]
pub fn rule_p3_first_deposit_inserts_bound_leaf() {
    let pool = initialized_pool(nondet_bytes());
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let cm = valid_cm();
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, cm);
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    let expected_leaf = poseidon2(&cm, &amount_to_field(amount)).expect("bound leaf computes");
    cvlr_assert!(post.frontier[0] == expected_leaf);
    cvlr_assert!(post.next_leaf_index == 1);
    cvlr_assert!(post.total_deposited == amount);
}

/// 3(b), amount dimension (A2): the leaf a deposit of `a1` inserts is
/// not the leaf bound to any other amount `a2 != a1` — so the value a
/// withdraw proof can open against this leaf is exactly `a1`, never
/// more. This is the NEW-1 exploit shape stated as a rule.
#[rule]
pub fn rule_p3_inserted_leaf_binds_this_amount_not_another() {
    let pool = initialized_pool(nondet_bytes());
    let a1: u64 = nondet();
    let a2: u64 = nondet();
    cvlr_assume!(a1 > 0);
    cvlr_assume!(a2 > 0);
    cvlr_assume!(a1 != a2);
    let cm = valid_cm();
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), a1, cm);
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    let leaf_a1 = poseidon2(&cm, &amount_to_field(a1)).expect("leaf a1 computes");
    let leaf_a2 = poseidon2(&cm, &amount_to_field(a2)).expect("leaf a2 computes");
    assume_distinct_bound_leaves(&leaf_a1, &leaf_a2);
    cvlr_assert!(post.frontier[0] == leaf_a1);
    cvlr_assert!(post.frontier[0] != leaf_a2);
    cvlr_assert!(post.frontier[0] != cm);
}

/// 3(b)+(d) through the tree: after two deposits, the level-1
/// frontier stash is `poseidon2(leaf1, leaf2)` over the two bound
/// leaves, `frontier[0]` still holds `leaf1`, the leaf index is 2,
/// and the stored root equals the independent from-scratch reference
/// root over `[leaf1, leaf2]` — the inserted values are the bound
/// leaves, in order, at the indices the handler claimed.
#[rule]
pub fn rule_p3_second_deposit_chains_bound_leaves() {
    let pool = initialized_pool(nondet_bytes());
    let cm1 = valid_cm();
    let cm2 = valid_cm();
    let a1: u64 = nondet();
    let a2: u64 = nondet();
    cvlr_assume!(a1 > 0);
    cvlr_assume!(a2 > 0);
    let depositor: [u8; 32] = nondet_bytes();
    let run1 = run_deposit(&pool, nondet(), depositor, nondet(), a1, cm1);
    cvlr_assume!(run1.result.is_ok());
    let mid = run1.pool();
    let run2 = run_deposit(&mid, nondet(), depositor, nondet(), a2, cm2);
    cvlr_assume!(run2.result.is_ok());
    let post = run2.pool();
    let leaf1 = poseidon2(&cm1, &amount_to_field(a1)).expect("leaf1 computes");
    let leaf2 = poseidon2(&cm2, &amount_to_field(a2)).expect("leaf2 computes");
    cvlr_assert!(post.frontier[0] == leaf1);
    let node = poseidon2(&leaf1, &leaf2).expect("level-1 node computes");
    cvlr_assert!(post.frontier[1] == node);
    cvlr_assert!(post.next_leaf_index == 2);
    let leaves: Vec<[u8; 32]> = Vec::from([leaf1, leaf2]);
    cvlr_assert!(post.current_root == reference_root(&leaves, crate::merkle::TREE_DEPTH));
}

/// 3(c) (A4-conditional): the amount bound into the leaf is the
/// amount the same instruction's transfer moves — the vault's
/// lamports increase by exactly the `amount` whose field encoding
/// the first-deposit rule binds into `frontier[0]`. There is no
/// execution in which the bound amount and the transferred amount
/// differ, because both assertions quantify over the single
/// `amount` argument of one run.
#[rule]
pub fn rule_p3_bound_amount_is_the_transferred_amount() {
    let pool = initialized_pool(nondet_bytes());
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let cm = valid_cm();
    let vault_pre: u64 = nondet();
    let run = run_deposit(&pool, vault_pre, nondet_bytes(), nondet(), amount, cm);
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();
    let expected_leaf = poseidon2(&cm, &amount_to_field(amount)).expect("bound leaf computes");
    cvlr_assert!(post.frontier[0] == expected_leaf);
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre + amount);
}

/// Reachability companion: the valid first-deposit scenario really
/// can succeed, so the binding rules above are not vacuous. Uses the
/// program tests' own sample commitment shape.
#[rule]
pub fn rule_p3_deposit_is_reachable() {
    let pool = initialized_pool(nondet_bytes());
    let mut cm = [0u8; 32];
    cm[0] = 0x11;
    cm[31] = 9;
    let run = run_deposit(&pool, 0, nondet_bytes(), 1_000_000, 500_000, cm);
    cvlr_assert!(run.result.is_ok());
}
