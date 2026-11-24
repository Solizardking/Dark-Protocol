//! Property 4 — Authority impotence: no signer-only path moves vault
//! funds.
//!
//! Spec text: `dark-protocol_spec.md`, Property 4(a)–(d). The survey
//! half (SURVEY.md §P4) establishes by code inspection that
//! `Pool.authority` is written exactly once (in `initialize`) and read
//! nowhere for authorization — no handler branches on it. The rules
//! here pin the executable half:
//!
//! - no handler ever *changes* `pool.authority`;
//! - the authority's signature confers nothing: a withdraw relayed
//!   and paid for by the authority itself is rejected at exactly the
//!   same gates as anyone else's;
//! - the only handler that can decrease the vault's lamports is
//!   `withdraw`, and only through property 2's gate sequence —
//!   `deposit` (by any signer, including the authority) can only
//!   increase them, and `transfer` does not even receive the vault
//!   account.

extern crate alloc;

use cvlr::prelude::*;

use super::harness::*;
use crate::{errors::DarkError, Pool};

fn pool_with_authority() -> (Pool, [u8; 32]) {
    let authority: [u8; 32] = nondet_bytes();
    let mut pool = initialized_pool(authority);
    pool.total_deposited = nondet();
    pool.total_withdrawn = nondet();
    cvlr_assume!(pool.total_withdrawn <= pool.total_deposited);
    (pool, authority)
}

/// 4(a), write side: `initialize` records the signer as authority —
/// the one and only write (the state construction in the harness
/// mirrors the handler's assignments; see harness docs).
/// 4(a), read side: across `deposit`, `withdraw` and `transfer`,
/// `pool.authority` is never modified, whatever the outcome.
#[rule]
pub fn rule_p4_authority_written_once_and_never_changed_by_handlers() {
    let (pool, authority) = pool_with_authority();
    cvlr_assert!(pool.authority.to_bytes() == authority);
    let dep = run_deposit(&pool, nondet(), nondet_bytes(), nondet(), nondet(), nondet_bytes());
    cvlr_assert!(dep.pool().authority.to_bytes() == authority);
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
    cvlr_assert!(wd.pool().authority.to_bytes() == authority);
    let tr = run_transfer(&pool, nondet_bytes());
    cvlr_assert!(tr.pool().authority.to_bytes() == authority);
}

/// 4(a)/(d): the authority acting as `fee_payer` (signing and paying
/// the marker rent) gains no rights: with an unknown root the
/// instruction is rejected with `UnknownRoot` exactly as for any
/// other signer, and nothing is paid.
#[rule]
pub fn rule_p4_authority_signature_confers_no_vault_rights() {
    let (pool, authority) = pool_with_authority();
    let unknown_root: [u8; 32] = nondet_bytes();
    cvlr_assume!(unknown_root != pool.current_root);
    let amount: u64 = nondet();
    cvlr_assume!(amount > 0);
    let vault_pre: u64 = nondet();
    let run = run_withdraw(
        &pool,
        vault_pre,
        nondet_bytes(),
        nondet(),
        authority, // fee_payer == pool.authority
        nondet_bytes(),
        unknown_root,
        nondet_bytes(),
        amount,
    );
    cvlr_assert!(err_is(&run.result, DarkError::UnknownRoot));
    cvlr_assert!(lamports(&run.accounts[1]) == vault_pre);
}

/// 4(b)/(c): `deposit` signed by the authority itself can only move
/// lamports *into* the vault (exactly `amount` on success — A4 —
/// and nothing on failure), and `total_withdrawn` never moves: there
/// is no deposit-shaped debit of the vault for any signer.
#[rule]
pub fn rule_p4_deposit_by_authority_only_credits_vault() {
    let (pool, authority) = pool_with_authority();
    let amount: u64 = nondet();
    let vault_pre: u64 = nondet();
    let run = run_deposit(&pool, vault_pre, authority, nondet(), amount, nondet_bytes());
    let post = run.pool();
    cvlr_assert!(post.total_withdrawn == pool.total_withdrawn);
    if run.result.is_ok() {
        cvlr_assert!(lamports(&run.accounts[1]) == vault_pre + amount);
    } else {
        cvlr_assert!(lamports(&run.accounts[1]) == vault_pre);
    }
}
