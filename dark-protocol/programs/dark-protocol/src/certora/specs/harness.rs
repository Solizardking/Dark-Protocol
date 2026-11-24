//! Harness that drives the program's real instruction handlers the way
//! the runtime would deliver them.
//!
//! Modelling conventions (assumptions A4/A6 in [`super::axioms`]):
//!
//! - Accounts are in-memory `AccountInfo`s built to satisfy the
//!   Aristotle spec's precondition 1: the pool account is the real
//!   `[b"pool"]` PDA owned by the program and holding a serialized
//!   `Pool`; the vault is the real `[b"vault", pool.key()]` PDA owned
//!   by the System Program; signer/writable flags match the Anchor
//!   context structs. The Anchor account structs (`Deposit`,
//!   `Withdraw`, `TransferAccounts`) are then constructed directly from
//!   those `AccountInfo`s (`Account::try_from`, `Signer::try_from`,
//!   `Program::try_from` perform the owner/discriminator/signer checks
//!   those wrappers always perform), and the handler is invoked with a
//!   `Context` carrying the canonical PDA bumps. Anchor's seed/bump
//!   re-validation inside `try_accounts` is part of the assumed
//!   validation layer (A6) — the harness always passes the true PDAs,
//!   so the validation it stands in for would succeed.
//! - `initialize`'s account creation and `withdraw`'s nullifier-marker
//!   creation are Anchor `init` CPIs into the System Program. Per A4
//!   they are modelled by their guaranteed post-state: the harness's
//!   `initialized_pool` builds exactly the `Pool` value `initialize`
//!   writes (using the program's own `Frontier` / `RootHistory`
//!   constructors, the same way the program's own unit tests build
//!   it), and the marker account is presented program-owned, sized
//!   `NullifierMarker::LEN`, holding the serialized zero marker — the
//!   state `init` + discriminator write produces before the handler
//!   body runs. A pre-existing marker aborts the transaction before
//!   the handler executes (runtime fact, precondition 1), so no rule
//!   needs to model it.
//! - All account memory is leaked (never freed) so the `AccountInfo`s
//!   stay valid for the whole rule — the same lifetime the runtime
//!   guarantees for one invocation. Post-state is read back through
//!   the same `AccountInfo`s the handler mutated.

extern crate alloc;

use alloc::{boxed::Box, vec::Vec};
use anchor_lang::prelude::*;

use crate::{
    dark_protocol,
    errors::DarkError,
    merkle::{Frontier, RootHistory, ROOT_HISTORY_SIZE, TREE_DEPTH},
    Deposit, NullifierMarker, Pool, TransferAccounts, Withdraw, ID,
};

/// Nondeterministic fixed-size byte array.
///
/// `cvlr-nondet` implements `Nondet` only for scalar types, `bool`, and
/// `Option<T>` — there is no `Nondet` impl for `[u8; N]` (verified
/// against the crate sources; see the clawd-tee suite's RESULTS.md,
/// prover run 2026-11-14). Byte arrays are therefore built element-wise
/// from scalar `nondet()` calls, the idiomatic CVLR pattern.
pub fn nondet_bytes<const N: usize>() -> [u8; N] {
    use cvlr::prelude::*;
    core::array::from_fn(|_| nondet())
}

// ── Well-known addresses ────────────────────────────────────────────────────

pub fn pool_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"pool"], &ID)
}

pub fn vault_pda(pool_key: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", pool_key.as_ref()], &ID)
}

pub fn marker_pda(nf: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"nf", nf.as_ref()], &ID)
}

/// The System Program id (`11111111111111111111111111111111`).
pub fn system_program_id() -> Pubkey {
    anchor_lang::system_program::System::id()
}

// ── Account construction ────────────────────────────────────────────────────

fn make_info(
    key: Pubkey,
    owner: Pubkey,
    lamports: u64,
    data: Vec<u8>,
    is_signer: bool,
    is_writable: bool,
    executable: bool,
) -> AccountInfo<'static> {
    let key: &'static Pubkey = Box::leak(Box::new(key));
    let owner: &'static Pubkey = Box::leak(Box::new(owner));
    let lamports: &'static mut u64 = Box::leak(Box::new(lamports));
    let data: &'static mut [u8] = Box::leak(data.into_boxed_slice());
    AccountInfo::new(
        key,
        is_signer,
        is_writable,
        lamports,
        data,
        owner,
        executable,
        0,
    )
}

/// Lamports used for accounts whose balance is not the quantity under
/// test. Deliberately an unremarkable constant: rules that care about a
/// balance take it as an explicit parameter instead.
pub const SOME_LAMPORTS: u64 = 1_000_000_000;

pub fn pool_info(pool: &Pool, lamports: u64) -> AccountInfo<'static> {
    let (key, _) = pool_pda();
    let mut data = Vec::new();
    pool.try_serialize(&mut data).expect("pool serializes");
    data.resize(Pool::LEN, 0);
    make_info(key, ID, lamports, data, false, true, false)
}

pub fn vault_info(pool_key: &Pubkey, lamports: u64) -> AccountInfo<'static> {
    let (key, _) = vault_pda(pool_key);
    make_info(key, system_program_id(), lamports, Vec::new(), false, true, false)
}

pub fn signer_info(key: Pubkey, lamports: u64) -> AccountInfo<'static> {
    make_info(key, system_program_id(), lamports, Vec::new(), true, true, false)
}

pub fn plain_info(key: Pubkey, lamports: u64, is_writable: bool) -> AccountInfo<'static> {
    make_info(key, system_program_id(), lamports, Vec::new(), false, is_writable, false)
}

pub fn system_program_info() -> AccountInfo<'static> {
    make_info(
        system_program_id(),
        system_program_id(),
        1,
        Vec::new(),
        false,
        false,
        true,
    )
}

/// The nullifier marker in its post-`init` state (A4): program-owned,
/// `NullifierMarker::LEN` bytes, discriminator written, fields zero —
/// exactly what the handler body sees when it starts.
pub fn marker_info(nf: &[u8; 32], lamports: u64) -> AccountInfo<'static> {
    let (key, _) = marker_pda(nf);
    let zero = NullifierMarker {
        nf: [0u8; 32],
        slot: 0,
        bump: 0,
    };
    let mut data = Vec::new();
    zero.try_serialize(&mut data).expect("marker serializes");
    data.resize(NullifierMarker::LEN, 0);
    make_info(key, ID, lamports, data, false, true, false)
}

// ── Post-state readers ──────────────────────────────────────────────────────

/// Field-by-field `Pool` equality (the `#[account]` struct does not
/// derive `PartialEq`; the array fields compare directly).
pub fn pool_eq(a: &Pool, b: &Pool) -> bool {
    a.authority == b.authority
        && a.current_root == b.current_root
        && a.root_history == b.root_history
        && a.history_next == b.history_next
        && a.history_len == b.history_len
        && a.frontier == b.frontier
        && a.next_leaf_index == b.next_leaf_index
        && a.total_deposited == b.total_deposited
        && a.total_withdrawn == b.total_withdrawn
        && a.vk_is_placeholder == b.vk_is_placeholder
        && a.bump == b.bump
        && a.vault_bump == b.vault_bump
}

pub fn read_pool(info: &AccountInfo) -> Pool {
    let data = info.try_borrow_data().expect("pool data readable");
    Pool::try_deserialize(&mut &data[..]).expect("pool data parses")
}

pub fn read_marker(info: &AccountInfo) -> NullifierMarker {
    let data = info.try_borrow_data().expect("marker data readable");
    NullifierMarker::try_deserialize(&mut &data[..]).expect("marker data parses")
}

pub fn lamports(info: &AccountInfo) -> u64 {
    info.lamports()
}

/// Leak an `AccountInfo` value itself, yielding the `&'static
/// AccountInfo<'static>` that Anchor 0.32's `TryFrom<&'info
/// AccountInfo<'info>>` impls for `Account` / `Signer` / `Program`
/// require (the reference and the pointee share one lifetime, so the
/// reference must be `'static`). The clone kept by the caller shares
/// the same underlying lamports/data cells, so post-state reads
/// through it observe the handler's mutations.
pub fn leak_info(info: AccountInfo<'static>) -> &'static AccountInfo<'static> {
    Box::leak(Box::new(info))
}

/// The Anchor custom error code of a handler result (`6000 + variant
/// index` for `DarkError`, matching the on-chain encoding the W5 devnet
/// rehearsal observed: UnknownRoot = 6004, ProofVerificationFailed =
/// 6006). `None` on success or for non-custom errors.
pub fn custom_error(result: &anchor_lang::Result<()>) -> Option<u32> {
    match result {
        Ok(()) => None,
        Err(anchor_lang::error::Error::AnchorError(e)) => Some(e.error_code_number),
        Err(anchor_lang::error::Error::ProgramError(with_origin)) => {
            match &with_origin.program_error {
                ProgramError::Custom(code) => Some(*code),
                _ => None,
            }
        }
        Err(_) => None,
    }
}

pub fn err_is(result: &anchor_lang::Result<()>, expected: DarkError) -> bool {
    custom_error(result) == Some(expected as u32 + 6000)
}

// ── State construction ──────────────────────────────────────────────────────

/// The `Pool` value `initialize` writes, built with the program's own
/// `Frontier` / `RootHistory` constructors — the same construction the
/// program's own unit tests use (`lib.rs` `tests::test_pool`). The
/// account-creation CPI itself is modelled per A4/A6 (see module docs).
pub fn initialized_pool(authority: [u8; 32]) -> Pool {
    let (pool_key, pool_bump) = pool_pda();
    let (_, vault_bump) = vault_pda(&pool_key);
    let frontier = Frontier::<TREE_DEPTH>::new().expect("frontier constructs");
    let initial_root = frontier.root().expect("empty root computes");
    let history = RootHistory::<ROOT_HISTORY_SIZE>::new(initial_root);
    Pool {
        authority: Pubkey::new_from_array(authority),
        current_root: initial_root,
        root_history: history.roots,
        history_next: history.next,
        history_len: history.len,
        frontier: frontier.filled,
        next_leaf_index: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        vk_is_placeholder: crate::vk::VK_IS_PLACEHOLDER,
        bump: pool_bump,
        vault_bump,
    }
}

/// Independent reference Merkle root over `leaves`, computed by sparse
/// divide-and-conquer directly from the leaf list — no frontier state,
/// no shared code path with `Frontier::insert` beyond `poseidon2`.
/// Ported from the program's own test reference (`merkle.rs`
/// `tests::reference_root`) so property 6(c) compares the frontier
/// against a from-scratch evaluation, as the spec requires.
pub fn reference_root(leaves: &[[u8; 32]], depth: usize) -> [u8; 32] {
    fn rec(leaves: &[[u8; 32]], lo: u64, depth: usize, zeros: &[[u8; 32]]) -> [u8; 32] {
        if lo >= leaves.len() as u64 {
            return zeros[depth];
        }
        if depth == 0 {
            return leaves.get(lo as usize).copied().unwrap_or([0u8; 32]);
        }
        let half = 1u64 << (depth - 1);
        let left = rec(leaves, lo, depth - 1, zeros);
        let right = rec(leaves, lo + half, depth - 1, zeros);
        if left == zeros[depth - 1] && right == zeros[depth - 1] {
            return zeros[depth];
        }
        crate::poseidon::poseidon2(&left, &right).expect("reference poseidon")
    }
    let zeros = crate::merkle::zero_chain(depth).expect("zero chain");
    rec(leaves, 0, depth, &zeros)
}

// ── Instruction runners ─────────────────────────────────────────────────────

/// Account order in every runner's returned vector mirrors the Anchor
/// context struct's field order, so rules index post-state by position.
pub struct Run {
    pub result: anchor_lang::Result<()>,
    pub accounts: Vec<AccountInfo<'static>>,
}

impl Run {
    pub fn pool(&self) -> Pool {
        read_pool(&self.accounts[0])
    }
}

/// `deposit(amount, cm)` against a pool in state `pool_pre`.
/// Accounts: `[pool, vault, depositor, system_program]`.
pub fn run_deposit(
    pool_pre: &Pool,
    vault_lamports: u64,
    depositor: [u8; 32],
    depositor_lamports: u64,
    amount: u64,
    cm: [u8; 32],
) -> Run {
    let (pool_key, _) = pool_pda();
    let pool = pool_info(pool_pre, SOME_LAMPORTS);
    let vault = vault_info(&pool_key, vault_lamports);
    let depositor_info = signer_info(Pubkey::new_from_array(depositor), depositor_lamports);
    let system = system_program_info();
    let accounts_vec = Vec::from([pool.clone(), vault.clone(), depositor_info.clone(), system.clone()]);

    let mut accounts = Deposit {
        pool: Account::try_from(leak_info(pool.clone())).expect("pool account validates"),
        vault: vault.clone(),
        depositor: Signer::try_from(leak_info(depositor_info.clone()))
            .expect("depositor is a signer"),
        system_program: Program::try_from(leak_info(system.clone()))
            .expect("system program validates"),
    };
    // Anchor 0.32 caches no bump for Deposit: both PDAs name their
    // stored bump (`bump = pool.bump` / `bump = pool.vault_bump`), so
    // `DepositBumps` is an empty struct.
    let bumps = crate::DepositBumps::default();
    let ctx = Context::new(&ID, &mut accounts, &[], bumps);
    let result = dark_protocol::deposit(ctx, amount, cm);
    Run {
        result,
        accounts: accounts_vec,
    }
}

/// `withdraw(proof, root, nf, amount)` against a pool in state
/// `pool_pre`, with the nullifier marker in its post-`init` state (A4).
/// Accounts: `[pool, vault, nullifier_marker, recipient, fee_payer,
/// system_program]`.
pub fn run_withdraw(
    pool_pre: &Pool,
    vault_lamports: u64,
    recipient: [u8; 32],
    recipient_lamports: u64,
    fee_payer: [u8; 32],
    proof: [u8; crate::PROOF_LEN],
    root: [u8; 32],
    nf: [u8; 32],
    amount: u64,
) -> Run {
    let (pool_key, _) = pool_pda();
    let pool = pool_info(pool_pre, SOME_LAMPORTS);
    let vault = vault_info(&pool_key, vault_lamports);
    let marker = marker_info(&nf, SOME_LAMPORTS);
    let recipient_info = plain_info(Pubkey::new_from_array(recipient), recipient_lamports, true);
    let fee_payer_info = signer_info(Pubkey::new_from_array(fee_payer), SOME_LAMPORTS);
    let system = system_program_info();
    let accounts_vec = Vec::from([
        pool.clone(),
        vault.clone(),
        marker.clone(),
        recipient_info.clone(),
        fee_payer_info.clone(),
        system.clone(),
    ]);

    let mut accounts = Withdraw {
        pool: Box::new(
            Account::try_from(leak_info(pool.clone())).expect("pool account validates"),
        ),
        vault: vault.clone(),
        nullifier_marker: Account::try_from(leak_info(marker.clone()))
            .expect("marker account validates"),
        recipient: recipient_info.clone(),
        fee_payer: Signer::try_from(leak_info(fee_payer_info.clone()))
            .expect("fee payer is a signer"),
        system_program: Program::try_from(leak_info(system.clone()))
            .expect("system program validates"),
    };
    // Only the marker's bump is cached (it is `init` with seeds); the
    // pool/vault PDAs name their stored bumps, so they have no fields.
    let bumps = crate::WithdrawBumps {
        nullifier_marker: marker_pda(&nf).1,
    };
    let ctx = Context::new(&ID, &mut accounts, &[], bumps);
    let result = dark_protocol::withdraw(ctx, proof, root, nf, amount);
    Run {
        result,
        accounts: accounts_vec,
    }
}

/// `transfer(...)` (the fail-closed stub) against a pool in state
/// `pool_pre`. Accounts: `[pool, sender, system_program]`.
pub fn run_transfer(pool_pre: &Pool, sender: [u8; 32]) -> Run {
    let (pool_key, _) = pool_pda();
    let pool = pool_info(pool_pre, SOME_LAMPORTS);
    let sender_info = signer_info(Pubkey::new_from_array(sender), SOME_LAMPORTS);
    let system = system_program_info();
    let accounts_vec = Vec::from([pool.clone(), sender_info.clone(), system.clone()]);

    let mut accounts = TransferAccounts {
        pool: Account::try_from(leak_info(pool.clone())).expect("pool account validates"),
        sender: Signer::try_from(leak_info(sender_info.clone())).expect("sender is a signer"),
        system_program: Program::try_from(leak_info(system.clone()))
            .expect("system program validates"),
    };
    let bumps = crate::TransferAccountsBumps::default();
    let ctx = Context::new(&ID, &mut accounts, &[], bumps);
    let result = dark_protocol::transfer(
        ctx,
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
        nondet_bytes(),
    );
    Run {
        result,
        accounts: accounts_vec,
    }
}
