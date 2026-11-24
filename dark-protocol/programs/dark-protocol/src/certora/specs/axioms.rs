//! Modelling assumptions the rules rely on.
//!
//! These are stated explicitly because the eventual claim — "these pool
//! properties are formally verified under documented assumptions" — is
//! only as strong as this list. Nothing in this file weakens a property:
//! each assumption names a fact about the *runtime or the cryptography*
//! that the SBF program itself cannot establish. They are the same
//! boundary the Aristotle spec drew (`dark-protocol_spec.md`, "External
//! dependencies — the verification boundary we expect"), restated for
//! the Certora Solana Prover.
//!
//! A1. Poseidon determinism (Prover model requirement).
//!     `poseidon2` delegates to the runtime's `sol_poseidon` syscall.
//!     The Prover does not natively model that syscall; the rules are
//!     written so that every Poseidon evaluation a rule depends on goes
//!     through the program's own `poseidon2`, on both the program side
//!     and the spec side of an assertion. The rules therefore need the
//!     Prover's model of `sol_poseidon` to be a *deterministic function*
//!     of its inputs within a run (same inputs ⇒ same output). If the
//!     deployed Prover instead havocs each call independently, the
//!     first-run tuning step is a summary making `sol_poseidon` a
//!     deterministic uninterpreted function — recorded in RESULTS.md
//!     when known. Determinism is all that properties 1, 2, 4 and 6
//!     need from Poseidon.
//!
//! A2. Poseidon collision resistance (property 3 only).
//!     Property 3's security content — "a commitment deposited with a
//!     1-lamport transfer can never produce the leaf a withdraw proof
//!     for a larger amount opens" — needs two *different* preimages to
//!     give different outputs. A deterministic model does NOT imply
//!     that. Rules that argue "changing the amount changes the bound
//!     leaf" apply A2 to the two concrete preimages in scope via
//!     [`assume_distinct_bound_leaves`]. Collision resistance itself is
//!     assumed, exactly as the Aristotle spec states it; the Prover
//!     does not (and cannot) prove it.
//!
//! A3. Groth16-verify oracle contract (runtime / external crate).
//!     `withdraw` step (3) calls `Groth16Verifier::verify()` from the
//!     `groth16-solana` crate, which evaluates the alt_bn128 syscalls.
//!     Those syscalls are not natively modelled either. The contract
//!     the rules rely on is the Aristotle spec's: `verify()` returns
//!     `Ok(())` only if the proof (with proof A negated by
//!     `negate_proof_a`) is a valid Groth16 proof for the public inputs
//!     `[root, nf, recipient, amount]` (in that order) under
//!     `vk::VERIFYING_KEY`, and an error otherwise. Rules are stated
//!     relative to the oracle's *result as executed*: gating rules
//!     prove that payment effects occur only on executions where
//!     `verify()` returned `Ok(())` and every program-side check before
//!     it passed, and that a `ProofVerificationFailed` execution
//!     changes nothing. Groth16 soundness itself, the correctness of
//!     the withdraw circuit the verifying key belongs to, and the
//!     trusted setup are OUT OF SCOPE (the circuit is the ZK track's
//!     separate workstream).
//!
//! A4. System-program CPI summary (runtime semantics).
//!     The handlers move lamports only through system-program transfer
//!     CPIs (deposit: depositor → vault; withdraw step (5): vault →
//!     recipient, signed with the vault PDA seeds). The rules' ledger
//!     assertions (Pool totals, marker and root state) are about state
//!     the program itself writes and do not depend on CPI fidelity.
//!     Rules that additionally assert *lamport* movements are marked
//!     A4-conditional in their doc comments: they are provable once the
//!     transfer CPI is given a summary faithful to the System Program's
//!     contract (a transfer of `amount` either moves exactly `amount`
//!     from source to destination, or fails and aborts the whole
//!     transaction). Account creation by Anchor `init` (the Pool at
//!     initialize, the NullifierMarker at withdraw) is likewise
//!     modelled by its guaranteed post-state — a program-owned,
//!     zero-filled account of the target size with the discriminator
//!     written — see `specs/harness.rs`.
//!
//! A5. Clock-sysvar fidelity (runtime semantics).
//!     `Clock::get()` returns the executing transaction's actual slot.
//!     Rules read time through the same `Clock::get()` the program
//!     reads.
//!
//! A6. Single-invocation account model (Anchor validation as
//!     precondition). Each rule models one program invocation whose
//!     accounts satisfy the Aristotle spec's precondition 1: the pool
//!     is the PDA with seeds `[b"pool"]`, the vault the PDA with seeds
//!     `[b"vault", pool.key()]`, signer/mutability flags as declared,
//!     and — for withdraw — the nullifier marker in its post-`init`
//!     state (A4), its prior existence having aborted the transaction
//!     before the handler ran. The harness constructs the Anchor
//!     account structs directly from `AccountInfo`s meeting those
//!     conditions (the same convention as the program's own state
//!     tests); Anchor's seeds/bump re-validation inside `try_accounts`
//!     is part of the assumed validation layer, not re-proven here.
//!     Transaction atomicity (any error rolls back every account
//!     change of the instruction, including account creation) is the
//!     runtime's guarantee and is what the no-state-change-on-error
//!     rules quantify over within the modelled invocation.

use cvlr::prelude::*;

/// A2, applied pairwise: two bound leaves whose preimages differ in the
/// amount component are different leaves.
///
/// The caller (a rule) guarantees the preimages actually differ — that
/// part is checked by the Prover from the rule's own construction
/// (it computes both leaves from `(cm, amount_to_field(a))` for two
/// different `a`s). This helper only discharges the step "different
/// preimage ⇒ different Poseidon output", which is assumption A2 and
/// is NOT proven.
pub fn assume_distinct_bound_leaves(leaf_a: &[u8; 32], leaf_b: &[u8; 32]) {
    cvlr_assume!(leaf_a != leaf_b);
}
