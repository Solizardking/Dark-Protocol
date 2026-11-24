//! Dark Protocol v2 — Groth16-verified shielded SOL pool.
//!
//! Rewrite of the v1 `dark-protocol-program`, which audit finding C-1 showed
//! verified nothing: `withdraw` accepted any caller-supplied nullifier, note
//! amounts/commitments were stored in plaintext, and any signer could drain
//! any note. This program holds no plaintext note data at all and pays out
//! only against a Groth16 proof verified on-chain.
//!
//! # Design (shared contract with the ZK track)
//!
//! - BN254 + circomlib Poseidon. `nk = Poseidon(sk, 0)`,
//!   `owner_id = Poseidon(sk, 1)`, `cm = Poseidon(owner_id, value, blinding)`,
//!   `nf = Poseidon(nk, leaf_index)`. Merkle depth 20,
//!   leaf = `Poseidon(cm, amount)` (the deposit-bound leaf, see below),
//!   node = `Poseidon(left, right)`, empty root from the zero chain
//!   `z[0] = 0`, `z[i+1] = Poseidon(z[i], z[i])`.
//! - `deposit(amount, cm)` pulls SOL into the vault PDA and inserts the
//!   **bound leaf** `Poseidon(cm, amount)` — computed by this program from
//!   the lamports it actually pulled — into the on-chain incremental tree.
//!   The withdraw circuit proves membership of the same bound leaf while
//!   opening `cm` at `value == amount`, so a commitment is spendable only
//!   for exactly the amount deposited against it. (Re-audit finding NEW-1:
//!   inserting raw `cm` let a 1-lamport deposit of a commitment crafted
//!   over an arbitrary value drain the pool with a valid proof.) The only
//!   note data ever stored is the commitment itself (a hash — hiding by
//!   Poseidon preimage resistance).
//! - `withdraw(proof, root, nf, amount)` pays the recipient account iff:
//!   1. `root` is in the pool's root-history ring (last 32 roots);
//!   2. the Groth16 proof verifies over public inputs
//!      `[root, nf, recipient, amount]` (in that order), where `recipient`
//!      is computed *by this program* from the recipient account's pubkey
//!      (see `poseidon::recipient_field`, ENCODING v1) — a proof is bound
//!      to its payee and cannot be redirected;
//!   3. the nullifier PDA `["nf", nf]` does not already exist — it is
//!      created by this instruction, so a second spend of the same `nf`
//!      fails at account creation. Double-spend is impossible by
//!      construction, and any failure aborts the whole transaction, so a
//!      rejected proof never burns a nullifier.
//!   V1 is full-note spend only: the circuit proves `value == amount`.
//! - `transfer` is a fail-closed stub (see its doc comment).
//!
//! # Verifying key status
//!
//! `vk::VK_IS_PLACEHOLDER` is `false`: `src/vk.rs` carries the real
//! verifying key for the current withdraw circuit (which includes the
//! NEW-1 leaf binding), generated from the ZK track's ceremony output by
//! its own export scripts — never hand-typed. The key comes from a LOCAL,
//! SINGLE-CONTRIBUTOR dev ceremony; production requires an MPC ceremony
//! and a fresh VK (see `vk.rs`). The flag is mirrored into the Pool
//! account at initialize so the state is visible on-chain. Verification
//! is never faked or bypassed.
//!
//! # Program id
//!
//! The id below belongs to the fresh program keypair generated in W5
//! (2026-11-17) for the devnet rehearsal; the keypair is stored outside
//! this tree (~/workspace/deploy-keys/, never committed). It replaced the
//! hash-derived placeholder DTpM3xKb… that nobody held a keypair for.

use anchor_lang::prelude::*;
use anchor_lang::system_program::Transfer;
use groth16_solana::groth16::Groth16Verifier;

pub mod errors;
pub mod merkle;
pub mod poseidon;
pub mod poseidon_params;
pub mod vk;
pub mod zero_chain;

#[cfg(feature = "certora")]
pub mod certora;

use errors::DarkError;
use merkle::{Frontier, RootHistory, MAX_LEAVES, ROOT_HISTORY_SIZE, TREE_DEPTH};
use poseidon::{amount_to_field, is_canonical_field_element, poseidon2, recipient_field};

declare_id!("2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL");

/// Groth16 proof size in bytes (A 64 ‖ B 128 ‖ C 64), groth16-solana format.
pub const PROOF_LEN: usize = 256;

#[program]
pub mod dark_protocol {
    use super::*;

    // ── initialize ──────────────────────────────────────────────────────

    /// Create the Pool PDA and its vault PDA. The signer becomes the pool
    /// authority. The authority has **no** fund-moving power in v1 — it is
    /// recorded for a future, separately-audited admin track. The empty
    /// tree's root seeds the root-history ring.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.vault_bump = ctx.bumps.vault;
        pool.bump = ctx.bumps.pool;
        pool.vk_is_placeholder = vk::VK_IS_PLACEHOLDER;

        let frontier = Frontier::<TREE_DEPTH>::new()?;
        pool.frontier = frontier.filled;
        pool.next_leaf_index = 0;

        let initial_root = frontier.root()?;
        pool.current_root = initial_root;
        let history = RootHistory::<ROOT_HISTORY_SIZE>::new(initial_root);
        pool.root_history = history.roots;
        pool.history_next = history.next;
        pool.history_len = history.len;

        pool.total_deposited = 0;
        pool.total_withdrawn = 0;

        emit!(ProtocolInitialized {
            authority: pool.authority,
            initial_root,
            vk_is_placeholder: pool.vk_is_placeholder,
        });
        Ok(())
    }

    // ── deposit ─────────────────────────────────────────────────────────

    /// Shield `amount` lamports: pull SOL from the depositor into the vault
    /// and insert the **bound leaf** `Poseidon(cm, amount)` as the next
    /// leaf. The binding is the NEW-1 fix: the leaf the tree holds commits
    /// to the deposited amount, and the withdraw circuit can only open a
    /// leaf whose commitment was computed over that same amount — so the
    /// value inside `cm` can never exceed (or differ from) the lamports
    /// actually deposited. Nothing about the note (owner, blinding) is
    /// revealed or stored — only `cm`, which is itself a Poseidon hash
    /// output, and the bound leaf derived from it.
    pub fn deposit(ctx: Context<Deposit>, amount: u64, cm: [u8; 32]) -> Result<()> {
        require!(amount > 0, DarkError::ZeroAmount);
        require!(cm != [0u8; 32], DarkError::ZeroCommitment);
        require!(
            is_canonical_field_element(&cm),
            DarkError::NonCanonicalFieldElement
        );

        // Bind the leaf to the deposited amount (NEW-1). Computed before
        // any state change; the circuit recomputes the identical value
        // from the note opening + public amount at withdraw time.
        let leaf = poseidon2(&cm, &amount_to_field(amount))?;

        let pool = &mut ctx.accounts.pool;
        require!(pool.next_leaf_index < MAX_LEAVES, DarkError::TreeFull);
        let leaf_index = pool.next_leaf_index;

        // Pull the SOL first: if the transfer fails, no state has changed.
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        // Fully qualified: the program has its own `transfer` instruction.
        anchor_lang::system_program::transfer(cpi_ctx, amount)?;

        // Insert the bound leaf and rotate the root into history.
        let mut frontier = Frontier::<TREE_DEPTH> {
            filled: pool.frontier,
            next_leaf_index: pool.next_leaf_index,
        };
        let new_root = frontier.insert(leaf)?;
        pool.frontier = frontier.filled;
        pool.next_leaf_index = frontier.next_leaf_index;
        pool.current_root = new_root;

        let mut history = RootHistory::<ROOT_HISTORY_SIZE> {
            roots: pool.root_history,
            next: pool.history_next,
            len: pool.history_len,
        };
        history.push(new_root);
        pool.root_history = history.roots;
        pool.history_next = history.next;
        pool.history_len = history.len;

        pool.total_deposited = pool
            .total_deposited
            .checked_add(amount)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;

        emit!(NoteDeposited {
            cm,
            leaf,
            leaf_index,
            new_root,
        });
        Ok(())
    }

    // ── withdraw ────────────────────────────────────────────────────────

    /// Unshield `amount` lamports to the recipient account, against a
    /// Groth16 proof. Checks run in the order documented at the top of this
    /// file: known root → ledger solvency → proof verification → payment.
    /// The nullifier PDA is created by Anchor's `init` before this handler
    /// runs; its prior existence aborts the transaction before any of this
    /// executes. Any error aborts the whole transaction, rolling back the
    /// nullifier creation — a rejected proof never burns a nullifier.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof: [u8; PROOF_LEN],
        root: [u8; 32],
        nf: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, DarkError::ZeroAmount);

        let pool = &mut ctx.accounts.pool;

        // (1) The proof must anchor to a root this pool actually produced.
        let history = RootHistory::<ROOT_HISTORY_SIZE> {
            roots: pool.root_history,
            next: pool.history_next,
            len: pool.history_len,
        };
        require!(history.contains(&root), DarkError::UnknownRoot);

        // (2) Ledger solvency: cumulative withdrawals can never exceed
        // cumulative deposits, independent of the vault's lamport balance
        // (donations to the vault cannot inflate the ledger).
        let outstanding = pool
            .total_deposited
            .checked_sub(pool.total_withdrawn)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;
        require!(amount <= outstanding, DarkError::InsufficientPoolBalance);

        // (3) Groth16 verification over [root, nf, recipient, amount].
        // The recipient field element is derived from the recipient account
        // in this transaction — never supplied by the caller.
        let recipient_key = ctx.accounts.recipient.key();
        let recipient = recipient_field(&recipient_key)?;
        let public_inputs: [[u8; 32]; vk::NR_PUBLIC_INPUTS] =
            [root, nf, recipient, amount_to_field(amount)];
        let proof_a = poseidon::negate_proof_a(&proof);
        let proof_b: [u8; 128] = proof[64..192]
            .try_into()
            .map_err(|_| error!(DarkError::ProofVerificationFailed))?;
        let proof_c: [u8; 64] = proof[192..256]
            .try_into()
            .map_err(|_| error!(DarkError::ProofVerificationFailed))?;
        let mut verifier = Groth16Verifier::new(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
            &vk::VERIFYING_KEY,
        )
        .map_err(|_| error!(DarkError::ProofVerificationFailed))?;
        verifier
            .verify()
            .map_err(|_| error!(DarkError::ProofVerificationFailed))?;

        // (4) The nullifier PDA was created by `init` in this transaction;
        // reaching here means this nf has never been spent. Record it.
        let marker = &mut ctx.accounts.nullifier_marker;
        marker.nf = nf;
        marker.slot = Clock::get()?.slot;
        marker.bump = ctx.bumps.nullifier_marker;

        // (5) Pay out of the vault PDA.
        pool.total_withdrawn = pool
            .total_withdrawn
            .checked_add(amount)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;
        let pool_key = pool.key();
        let vault_bump = [pool.vault_bump];
        let seeds: &[&[u8]] = &[b"vault", pool_key.as_ref(), &vault_bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            signer_seeds,
        );
        anchor_lang::system_program::transfer(cpi_ctx, amount)?;

        emit!(NoteWithdrawn {
            nf,
            amount,
            recipient: ctx.accounts.recipient.key(),
        });
        Ok(())
    }

    // ── transfer (fail-closed stub) ─────────────────────────────────────

    /// Shielded transfer (spend one note, create two) is **not enabled**.
    ///
    /// The verify → nullify → append pattern is established by `withdraw`,
    /// but a transfer needs its own circuit and verifying key, whose
    /// public-input layout the shared contract does not yet define (the
    /// withdraw circuit's `[root, nf, recipient, amount]` cannot express
    /// hidden-value conservation between one input and two outputs). Until
    /// the ZK track specifies and delivers that circuit + VK, this
    /// instruction always errors — it never silently succeeds, never moves
    /// funds, and never consumes a nullifier.
    pub fn transfer(
        _ctx: Context<TransferAccounts>,
        _proof: [u8; PROOF_LEN],
        _root: [u8; 32],
        _nf: [u8; 32],
        _cm1: [u8; 32],
        _cm2: [u8; 32],
    ) -> Result<()> {
        err!(DarkError::TransferNotEnabled)
    }
}

// ─── accounts ────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Pool::LEN,
        seeds = [b"pool"],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: native-SOL vault PDA. Holds only lamports; its address is
    /// derived from the pool and it can sign only via this program's
    /// `withdraw` CPI. It stores no data.
    #[account(
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: vault PDA (see Initialize). Mutated only as the system
    /// program transfer destination.
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proof: [u8; PROOF_LEN], root: [u8; 32], nf: [u8; 32], amount: u64)]
pub struct Withdraw<'info> {
    // Boxed: `Pool` is 1,765 bytes inline, which pushed both this struct's
    // `try_accounts` frame (4,224 B) and the withdraw dispatch frame
    // (4,352 B) over the 4,096-byte SBF stack limit. On the heap it costs
    // the frame a pointer; account semantics and the IDL are unchanged.
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// CHECK: vault PDA (see Initialize). Mutated only as the system
    /// program transfer source, signed with the vault's PDA seeds.
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    /// The spent-nullifier marker. `init` is the double-spend control:
    /// if a marker for this `nf` already exists, account creation fails
    /// and the whole transaction aborts before any payment. Seeds bind the
    /// marker to exactly the `nf` proven in this instruction.
    #[account(
        init,
        payer = fee_payer,
        space = NullifierMarker::LEN,
        seeds = [b"nf", nf.as_ref()],
        bump,
    )]
    pub nullifier_marker: Account<'info, NullifierMarker>,

    /// CHECK: payee. Needs no signature — authorization is the Groth16
    /// proof, whose `recipient` public input is computed by the program
    /// from this account's key (see `poseidon::recipient_field`), so funds
    /// can only land on the exact payee the proof was made for. Any account
    /// may relay the transaction.
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    /// Pays the nullifier marker's rent. Any signer (recipient, relayer,
    /// or third party) may pay; the fee payer gains no rights over the
    /// payout, which is bound to `recipient` by the proof.
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAccounts<'info> {
    #[account(
        seeds = [b"pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub sender: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── state ───────────────────────────────────────────────────────────────

/// Global pool state. Deliberately contains **no note data**: no amounts
/// per note, no ciphertexts, no depositor list — only the Merkle frontier,
/// the root-history ring, and aggregate deposit/withdraw totals used for
/// the solvency invariant.
#[account]
pub struct Pool {
    /// Recorded at initialize; no fund-moving authority in v1.
    pub authority: Pubkey,                                  // 32
    pub current_root: [u8; 32],                             // 32
    pub root_history: [[u8; 32]; ROOT_HISTORY_SIZE],        // 32 * 32
    pub history_next: u8,                                   // 1
    pub history_len: u8,                                    // 1
    pub frontier: [[u8; 32]; TREE_DEPTH],                   // 20 * 32
    pub next_leaf_index: u64,                               // 8
    pub total_deposited: u64,                               // 8
    pub total_withdrawn: u64,                               // 8
    /// Mirrors `vk::VK_IS_PLACEHOLDER` at initialize time.
    pub vk_is_placeholder: bool,                            // 1
    pub bump: u8,                                           // 1
    pub vault_bump: u8,                                     // 1
}

impl Pool {
    pub const LEN: usize = 8 // discriminator
        + 32 + 32 + (32 * ROOT_HISTORY_SIZE) + 1 + 1
        + (32 * TREE_DEPTH) + 8 + 8 + 8 + 1 + 1 + 1;
}

/// Existence of this account *is* the spent record for `nf`.
#[account]
pub struct NullifierMarker {
    pub nf: [u8; 32],   // 32
    pub slot: u64,      // 8
    pub bump: u8,       // 1
}

impl NullifierMarker {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

// ─── events ──────────────────────────────────────────────────────────────

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub initial_root: [u8; 32],
    pub vk_is_placeholder: bool,
}

#[event]
pub struct NoteDeposited {
    pub cm: [u8; 32],
    /// The bound leaf actually inserted: `Poseidon(cm, amount)`. Emitted
    /// so off-chain tree builders (indexer, wallets) reconstruct the exact
    /// tree the program maintains (amount is also in the instruction data).
    pub leaf: [u8; 32],
    pub leaf_index: u64,
    pub new_root: [u8; 32],
}

#[event]
pub struct NoteWithdrawn {
    pub nf: [u8; 32],
    pub amount: u64,
    pub recipient: Pubkey,
}

// ─── state-machine tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pool() -> Pool {
        let frontier = Frontier::<TREE_DEPTH>::new().unwrap();
        let initial_root = frontier.root().unwrap();
        let history = RootHistory::<ROOT_HISTORY_SIZE>::new(initial_root);
        Pool {
            authority: Pubkey::default(),
            current_root: initial_root,
            root_history: history.roots,
            history_next: history.next,
            history_len: history.len,
            frontier: frontier.filled,
            next_leaf_index: 0,
            total_deposited: 0,
            total_withdrawn: 0,
            vk_is_placeholder: true,
            bump: 0,
            vault_bump: 0,
        }
    }

    /// The deposit-side state transition, mirrored 1:1 from the handler
    /// (minus the SOL transfer) so tests exercise the same logic shape —
    /// including the NEW-1 bound-leaf computation.
    fn apply_deposit(pool: &mut Pool, cm: [u8; 32], amount: u64) -> Result<[u8; 32]> {
        let leaf = poseidon2(&cm, &amount_to_field(amount))?;
        let mut frontier = Frontier::<TREE_DEPTH> {
            filled: pool.frontier,
            next_leaf_index: pool.next_leaf_index,
        };
        let new_root = frontier.insert(leaf)?;
        pool.frontier = frontier.filled;
        pool.next_leaf_index = frontier.next_leaf_index;
        pool.current_root = new_root;
        let mut history = RootHistory::<ROOT_HISTORY_SIZE> {
            roots: pool.root_history,
            next: pool.history_next,
            len: pool.history_len,
        };
        history.push(new_root);
        pool.root_history = history.roots;
        pool.history_next = history.next;
        pool.history_len = history.len;
        pool.total_deposited = pool
            .total_deposited
            .checked_add(amount)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;
        Ok(new_root)
    }

    /// The withdraw-side *state* checks (known root + solvency), mirrored
    /// from the handler. Proof verification and nullifier-PDA creation are
    /// runtime concerns enforced structurally (see handler docs).
    fn check_withdraw_state(pool: &Pool, root: &[u8; 32], amount: u64) -> Result<()> {
        let history = RootHistory::<ROOT_HISTORY_SIZE> {
            roots: pool.root_history,
            next: pool.history_next,
            len: pool.history_len,
        };
        require!(history.contains(root), DarkError::UnknownRoot);
        let outstanding = pool
            .total_deposited
            .checked_sub(pool.total_withdrawn)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;
        require!(amount <= outstanding, DarkError::InsufficientPoolBalance);
        Ok(())
    }

    fn sample_cm(i: u8) -> [u8; 32] {
        let mut cm = [0u8; 32];
        cm[0] = 0x11;
        cm[31] = i;
        cm
    }

    #[test]
    fn deposits_advance_root_and_history() {
        let mut pool = test_pool();
        let empty = pool.current_root;
        let r1 = apply_deposit(&mut pool, sample_cm(1), 500).unwrap();
        assert_ne!(r1, empty);
        assert_eq!(pool.current_root, r1);
        assert_eq!(pool.next_leaf_index, 1);
        assert_eq!(pool.total_deposited, 500);
        // Both the empty root and r1 are valid anchors at this point.
        assert!(check_withdraw_state(&pool, &empty, 1).is_ok());
        assert!(check_withdraw_state(&pool, &r1, 500).is_ok());
        // Over-withdrawal against the ledger is rejected.
        assert!(check_withdraw_state(&pool, &r1, 501).is_err());
        // A root the pool never produced is rejected.
        assert!(check_withdraw_state(&pool, &[7u8; 32], 1).is_err());
    }

    #[test]
    fn deposit_inserts_amount_bound_leaf() {
        // NEW-1 regression (program side): the leaf a deposit inserts must
        // be Poseidon(cm, amount) — the exact value the withdraw circuit
        // recomputes from the note opening and the public amount. If the
        // raw commitment (pre-fix behavior) or a leaf bound to any other
        // amount were inserted, the resulting root would differ.
        let mut pool = test_pool();
        let cm = sample_cm(9);
        let root = apply_deposit(&mut pool, cm, 500).unwrap();

        // A frontier whose only insert is the bound leaf roots identically.
        let leaf = poseidon2(&cm, &amount_to_field(500)).unwrap();
        let mut f = Frontier::<TREE_DEPTH>::new().unwrap();
        assert_eq!(f.insert(leaf).unwrap(), root);

        // The raw commitment as a leaf (the pre-fix behavior) roots differently.
        let mut f_raw = Frontier::<TREE_DEPTH>::new().unwrap();
        assert_ne!(f_raw.insert(cm).unwrap(), root);

        // The same commitment bound to a different amount roots differently:
        // a 1-lamport deposit can never produce the leaf a 500-lamport
        // withdraw proof opens.
        let leaf_other = poseidon2(&cm, &amount_to_field(1)).unwrap();
        let mut f_other = Frontier::<TREE_DEPTH>::new().unwrap();
        assert_ne!(f_other.insert(leaf_other).unwrap(), root);
    }

    #[test]
    fn old_roots_age_out_of_the_ring() {
        let mut pool = test_pool();
        let first_root = apply_deposit(&mut pool, sample_cm(1), 10).unwrap();
        // 32 more deposits evict both the empty root and first_root
        // (the ring holds only the last 32 roots).
        for i in 0..ROOT_HISTORY_SIZE {
            apply_deposit(&mut pool, sample_cm(2 + i as u8), 10).unwrap();
        }
        assert!(check_withdraw_state(&pool, &first_root, 1).is_err());
        let current = pool.current_root;
        assert!(check_withdraw_state(&pool, &current, 1).is_ok());
    }

    #[test]
    fn nullifier_pda_derivation_is_unique_per_nf() {
        // The double-spend control is Anchor `init` on seeds ["nf", nf]:
        // the marker address must be a deterministic, collision-free
        // function of the nullifier alone.
        let nf1 = [3u8; 32];
        let nf2 = [4u8; 32];
        let (addr1, _) = Pubkey::find_program_address(&[b"nf", &nf1], &crate::ID);
        let (addr1_again, _) = Pubkey::find_program_address(&[b"nf", &nf1], &crate::ID);
        let (addr2, _) = Pubkey::find_program_address(&[b"nf", &nf2], &crate::ID);
        assert_eq!(addr1, addr1_again);
        assert_ne!(addr1, addr2);
    }

    #[test]
    fn pool_len_matches_layout() {
        // 8 disc + 32 + 32 + 1024 + 1 + 1 + 640 + 8 + 8 + 8 + 1 + 1 + 1
        assert_eq!(Pool::LEN, 1765);
        assert_eq!(NullifierMarker::LEN, 49);
    }
}
