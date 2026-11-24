//! Property 6 — Root-history and frontier integrity.
//!
//! Spec text: `dark-protocol_spec.md`, Property 6(a)–(d). Parts
//! (a)/(b)/(d) are ring and root bookkeeping; part (c) is the deep
//! one — the frontier's stored root after `n` deposits must equal a
//! **from-scratch divide-and-conquer evaluation** of the depth-20
//! Poseidon Merkle tree over the inserted bound leaves, not merely
//! the frontier algorithm restating itself. The harness's
//! `reference_root` is that independent evaluation (ported from the
//! program's own test reference, which shares no code path with
//! `Frontier::insert` beyond `poseidon2` — determinism A1 is all it
//! needs; collision resistance is *not* assumed here).
//!
//! The eviction rule (d) operates directly on the program's
//! `RootHistory<32>` type — the exact type whose fields the handlers
//! serialize into `Pool` — because driving 33 full deposits (each
//! with its 20-hash frontier fold) through the handler is the
//! suite's highest-cost shape for a purely arithmetic claim about
//! the ring. The handler-level ring rules (b) cover the wiring
//! between deposits and the ring at small counts.

extern crate alloc;

use alloc::vec::Vec;
use cvlr::prelude::*;

use super::harness::*;
use crate::{
    merkle::{empty_root, Frontier, RootHistory, ROOT_HISTORY_SIZE, TREE_DEPTH},
    poseidon::{amount_to_field, poseidon2},
};

/// Rebuild the `RootHistory` view over a pool's ring fields.
fn ring_of(pool: &crate::Pool) -> RootHistory<ROOT_HISTORY_SIZE> {
    RootHistory {
        roots: pool.root_history,
        next: pool.history_next,
        len: pool.history_len,
    }
}

/// 6(a). After `initialize`: `current_root` is the empty-tree root
/// `z[20]`; the ring contains exactly that root (`history_len == 1`,
/// `history_next == 1`); `contains` accepts it and rejects the zero
/// value and every other value; the ledger is empty.
#[rule]
pub fn rule_p6_initialize_state() {
    let pool = initialized_pool(nondet_bytes());
    let z20 = empty_root(TREE_DEPTH).expect("empty root computes");
    cvlr_assert!(pool.current_root == z20);
    cvlr_assert!(pool.history_len == 1);
    cvlr_assert!(pool.history_next == 1);
    cvlr_assert!(pool.next_leaf_index == 0);
    cvlr_assert!(pool.total_deposited == 0);
    cvlr_assert!(pool.total_withdrawn == 0);
    let ring = ring_of(&pool);
    cvlr_assert!(ring.contains(&pool.current_root));
    cvlr_assert!(!ring.contains(&[0u8; 32]));
    let other: [u8; 32] = nondet_bytes();
    cvlr_assume!(other != pool.current_root);
    cvlr_assert!(!ring.contains(&other));
}

/// 6(b). A successful deposit appends exactly the root its
/// `Frontier::insert` returned: recomputing the insert in the rule
/// from the pre-state frontier and the bound leaf yields the stored
/// `current_root`; the ring gains exactly that root (both the
/// initial root and the new root are anchors afterwards), and the
/// ring counters advance by one.
#[rule]
pub fn rule_p6_deposit_appends_exactly_the_insert_root() {
    let pool = initialized_pool(nondet_bytes());
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let cm: [u8; 32] = nondet_bytes();
    cvlr_assume!(cm != [0u8; 32]);
    cvlr_assume!(crate::poseidon::is_canonical_field_element(&cm));
    let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, cm);
    cvlr_assume!(run.result.is_ok());
    let post = run.pool();

    let leaf = poseidon2(&cm, &amount_to_field(amount)).expect("bound leaf computes");
    let mut frontier = Frontier::<TREE_DEPTH> {
        filled: pool.frontier,
        next_leaf_index: pool.next_leaf_index,
    };
    let inserted_root = frontier.insert(leaf).expect("insert computes");
    cvlr_assert!(post.current_root == inserted_root);
    cvlr_assert!(post.frontier == frontier.filled);
    cvlr_assert!(post.next_leaf_index == 1);
    cvlr_assert!(post.history_len == 2);
    cvlr_assert!(post.history_next == 2);
    let ring = ring_of(&post);
    cvlr_assert!(ring.contains(&post.current_root));
    cvlr_assert!(ring.contains(&pool.current_root));
}

/// 6(c). Frontier consistency against the from-scratch reference:
/// after each of three deposits, `next_leaf_index` counts the
/// deposits, the stored root equals `reference_root` over the bound
/// leaves inserted so far, and the frontier's own `root()` agrees.
#[rule]
pub fn rule_p6_frontier_matches_reference_root() {
    let mut pool = initialized_pool(nondet_bytes());
    let mut leaves: Vec<[u8; 32]> = Vec::new();
    for i in 0..3u8 {
        let cm: [u8; 32] = nondet_bytes();
        cvlr_assume!(cm != [0u8; 32]);
        cvlr_assume!(crate::poseidon::is_canonical_field_element(&cm));
        let amount: u64 = nondet();
        cvlr_assume!(amount > 0);
        let run = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), amount, cm);
        cvlr_assume!(run.result.is_ok());
        pool = run.pool();
        let leaf = poseidon2(&cm, &amount_to_field(amount)).expect("bound leaf computes");
        leaves.push(leaf);
        cvlr_assert!(pool.next_leaf_index == (i as u64) + 1);
        cvlr_assert!(pool.current_root == reference_root(&leaves, TREE_DEPTH));
        let frontier = Frontier::<TREE_DEPTH> {
            filled: pool.frontier,
            next_leaf_index: pool.next_leaf_index,
        };
        cvlr_assert!(frontier.root().expect("frontier root computes") == pool.current_root);
        // Ring counters track the deposit count (spec 6b invariants).
        cvlr_assert!(pool.history_len == (i + 2));
        cvlr_assert!(pool.history_next == (i + 2));
    }
}

/// 6(d), type level: the ring holds exactly the last 32 roots
/// produced. The initial root plus 32 further pushes (33 roots in
/// total) evict the initial root (`contains` false), retain the
/// last 32 roots (2..=33 here), and saturate/wrap the counters
/// exactly as specified: `len == 32`, `next == 33 % 32 == 1`. The
/// zero value is rejected at every stage. (Same sequence as the
/// program's own `root_history_ring_evicts_oldest` test.)
#[rule]
pub fn rule_p6_ring_eviction_exactly_at_32() {
    let initial = [1u8; 32];
    let mut ring = RootHistory::<ROOT_HISTORY_SIZE>::new(initial);
    cvlr_assert!(ring.contains(&initial));
    cvlr_assert!(!ring.contains(&[0u8; 32]));
    for i in 2..=33u8 {
        ring.push([i; 32]);
    }
    // 32 pushes after the initial root: initial evicted, 2..=33 held.
    cvlr_assert!(!ring.contains(&initial));
    cvlr_assert!(ring.contains(&[2u8; 32]));
    cvlr_assert!(ring.contains(&[33u8; 32]));
    cvlr_assert!(ring.contains(&[3u8; 32]));
    cvlr_assert!(!ring.contains(&[0u8; 32]));
    cvlr_assert!(ring.len == 32);
    cvlr_assert!(ring.next == 1);
}

/// 6(b), negative half: no instruction other than `deposit` adds
/// ring entries or moves the tree — `withdraw` (any outcome) and
/// `transfer` leave `current_root`, the ring fields, the frontier
/// and the leaf index byte-identical.
#[rule]
pub fn rule_p6_only_deposit_moves_the_tree() {
    let pool = initialized_pool(nondet_bytes());
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
    let post_wd = wd.pool();
    cvlr_assert!(post_wd.current_root == pool.current_root);
    cvlr_assert!(post_wd.root_history == pool.root_history);
    cvlr_assert!(post_wd.history_next == pool.history_next);
    cvlr_assert!(post_wd.history_len == pool.history_len);
    cvlr_assert!(post_wd.frontier == pool.frontier);
    cvlr_assert!(post_wd.next_leaf_index == pool.next_leaf_index);
    let tr = run_transfer(&pool, nondet_bytes());
    cvlr_assert!(pool_eq(&tr.pool(), &pool));
}
