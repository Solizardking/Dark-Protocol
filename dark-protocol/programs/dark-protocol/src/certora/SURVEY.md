# Program survey — `dark-protocol` (v2) vs. the seven properties

Program: `dark_protocol`, Anchor 0.32, program id
`2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (devnet). Source:
`dark-protocol/programs/dark-protocol/src/` in this repository —
sha256-identical to the merged canonical tree
(`~/workspace/zolana-transplant-merge/dark-protocol/`) from which the
deployed devnet artifact was built; the NEW-1 fix is at
`src/lib.rs:141` (`let leaf = poseidon2(&cm, &amount_to_field(amount))?;`).

Properties: `dark-protocol/aristotle/dark-protocol_spec.md`,
Properties 0–6. That spec was written for the Aristotle prover; its
2026-11-18 pilot run ended OUT_OF_BUDGET with zero verdicts. This
survey maps the same properties onto the Certora CVLR suite in this
directory (`specs/p0_*.rs` … `specs/p6_*.rs`).

**Explicitly out of scope — the other program in this repo.**
`dark-protocol-program/` (program id
`E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm`) is the **v1** Sapling
note pool (devnet alpha). It is a different program with a **known
open spend-authorization gap** (its `withdraw` / `shielded_transfer`
do not yet bind spends to proof of note ownership — see
`docs/FORMAL_VERIFICATION.md` §P-C in this repo). No spec in this
suite is written against it, and no verdict here says anything about
it. Do not mistake the v1 tree for the canonical source.

**Verification boundary (restated from the Aristotle spec).**
Groth16 soundness, the withdraw circuit's correctness, and the
trusted setup are out of scope (the circuit is the ZK track's
separate workstream; the VK in `src/vk.rs` is from a local
single-contributor dev ceremony). Poseidon is assumed deterministic
(A1) and, for property 3 only, collision-resistant (A2). `verify()`
is an oracle with the contract stated in A3. Lamport-level claims
ride on the System Program's transfer contract (A4) and are marked
A4-conditional wherever they appear. The full assumption list is
`specs/axioms.rs`.

**Harness modelling (what "the rules drive the real handlers"
means here).** Rules call the real handler functions
(`crate::dark_protocol::{deposit, withdraw, transfer}`) with Anchor
account structs constructed from in-memory `AccountInfo`s satisfying
the spec's precondition 1 (true PDA keys, correct owners/flags,
serialized state) — assumption A6. Two things are modelled by their
guaranteed post-state rather than executed (A4): the Pool's creation
at `initialize` (the harness builds the exact `Pool` value the
handler writes, using the program's own `Frontier`/`RootHistory`
constructors — the same construction as the program's own unit
tests), and the nullifier marker's `init` at `withdraw` (presented
program-owned, discriminator written, fields zero). A pre-existing
marker aborts the transaction before the handler runs (runtime fact),
so double-spend-by-replay never reaches handler code; property 2's
marker rules quantify over the fresh-marker execution.

---

## §P0 No UB / no panics — **ENFORCED by construction; rules pin it**

Handlers use `checked_add`/`checked_sub` for all total updates
(failures return `DarkError::ArithmeticOverflow`), index only into
fixed arrays with loop-bounded indices, slice the proof buffer at
constant offsets (`proof[64..192]`, `proof[192..256]` on a
`[u8; 256]`), and divide only by non-zero constants in
`merkle.rs` (`idx /= 2`, `% SIZE`). `specs/p0_no_ub.rs` drives every
handler plus the Merkle/Poseidon helpers with fully nondeterministic
valid-shaped inputs; in CVLR a modelled panic is a rule violation, so
the rules fail iff a panicking path exists. `initialize` is covered
through its helper surface (0d) plus §P6(a)'s state pin, per the A4
modelling above.

## §P1 Conservation / ledger integrity — **ENFORCED**

`deposit` adds `amount` to `total_deposited` via `checked_add` after
the transfer CPI and the tree insert; `withdraw` adds to
`total_withdrawn` only after `amount ≤ total_deposited −
total_withdrawn` (checked) passes; no other handler touches the
totals, and `transfer` always errors (`lib.rs`: `err!(DarkError::
TransferNotEnabled)`). The solvency gate reads only the totals —
never the vault's lamport balance — so donations cannot inflate it
(rule `rule_p1_donations_do_not_inflate_ledger` quantifies over an
arbitrary vault balance). Rules: `specs/p1_conservation.rs` (7).
The lamport-movement rule (1d) is A4-conditional.

## §P2 Withdraw gating — **ENFORCED, in the spec's order**

Handler order in `withdraw` (`lib.rs`): `require!(amount > 0)` →
`history.contains(&root)` → solvency `checked_sub` + `require!` →
recipient derivation + `Groth16Verifier::verify()` → marker write →
`total_withdrawn` update → vault-signed transfer CPI. The rules pin
the order with multi-violation inputs (earliest gate's error must
surface) and state the payment claims conditionally on the oracle's
executed result (A3): a `ProofVerificationFailed` execution leaves
pool, marker and balances untouched; an `Ok` execution writes the
marker for exactly the instruction's `nf` (under the
`["nf", nf]` PDA) and pays exactly `amount` to the recipient
account — the account whose key the program itself fed into
`recipient_field`, never a caller-supplied field element. Rules:
`specs/p2_withdraw_gating.rs` (5). Lamport halves of the success
rule are A4-conditional. The marker's `slot` field is a verbatim
`Clock::get()?.slot` passthrough (one assignment, survey-verified);
the rules assert `nf` and `bump`, not the slot value, because the
modelled clock is read independently by rule and handler (A5).

## §P3 Deposit binding (NEW-1) — **ENFORCED; the fix is the handler's second statement block**

`deposit` validates amount/commitment/canonicality, computes
`leaf = poseidon2(&cm, &amount_to_field(amount))` **before** the
`TreeFull` check, the transfer, and any state write, then inserts
exactly that `leaf` and emits it in `NoteDeposited`. There is one
`amount` variable in scope: the value bound into the leaf and the
value passed to `anchor_lang::system_program::transfer` are the same
instruction argument (rule `rule_p3_bound_amount_is_the_transferred_amount`
quantifies over that single argument; the CPI half is
A4-conditional). The first-deposit rules read the inserted leaf back
from `frontier[0]` — at index 0 the frontier stash *is* the leaf —
and the A2 companion rule states the exploit shape directly: the
leaf inserted by a deposit of `a1` is not the leaf bound to any
`a2 != a1`. Rules: `specs/p3_deposit_binding.rs` (9). **This
property is the suite's first cloud-submission target**
(`confs/p3_deposit_binding.conf`).

## §P4 Authority impotence — **ENFORCED (survey + rules)**

Survey: `pool.authority` is assigned once, in `initialize`
(`pool.authority = ctx.accounts.authority.key()`), and the string
`authority` occurs in no authorization position anywhere else in
the crate — no handler reads `pool.authority`, and the only vault
debit in the program is `withdraw`'s step-(5) CPI, signed with the
vault PDA seeds and gated by §P2. `deposit`'s only CPI credits the
vault from the signing depositor; `initialize` moves only the rent
the payer funds for the Pool account itself. Rules pin the
executable half: authority is byte-identical after every handler;
an authority-signed, authority-paid withdraw with an unknown root
is rejected exactly like anyone else's; an authority-signed deposit
can only credit the vault. Rules: `specs/p4_authority.rs` (3).

## §P5 Progress + error classification — **classification ENFORCED; progress BOUNDARY-LIMITED (A3)**

Classification: the handler's own `DarkError` surface in `withdraw`
is exactly {`ZeroAmount`, `UnknownRoot`, `InsufficientPoolBalance`,
`ProofVerificationFailed`, `PoseidonError` (from the
`recipient_field` `?`)}; non-custom failures are Anchor/runtime
(Clock, CPI, account validation). `ArithmeticOverflow` is
unreachable under the invariant: the `checked_sub` is guarded by
`total_withdrawn ≤ total_deposited` (maintained by §P1's rules) and
the `checked_add` by `amount ≤ outstanding`. Both classification
claims are conf'd rules in `specs/p5_progress.rs`.

Progress is the boundary-limited half, exactly as the Aristotle
spec's instruction anticipates ("report it as refuted or
boundary-limited … rather than silently assuming a stronger
contract"). Progress needs condition 4 — the proof is valid, so
`verify()` returns `Ok(())` — but the Prover does not model the
alt_bn128 syscalls, so within the current summaries `verify()`'s
result is unconstrained and "the valid scenario succeeds" is not
yet a theorem of the model. The claim is written out in full as
`rule_p5_progress_under_oracle_contract`, **excluded from every
conf**, to be promoted into `p5_progress.conf` when `verify()`
carries an A3-faithful summary. The rent-floor conditions (spec
condition 6 — the only runtime conditions that ever blocked a
valid withdraw in the W5 devnet rehearsal) are A4/runtime facts,
stated in the rule's scenario.

## §P6 Root-history / frontier integrity — **ENFORCED**

(a) `initialize` seeds the ring with `Frontier::new().root()` =
`z[20]` from the pinned zero-chain table (table correctness is
itself pinned by the program's host test
`zero_chain_table_matches_computed_chain`). (b) `deposit` stores
`frontier.insert(leaf)`'s return as `current_root` and pushes
exactly it; counters advance `len = min(1 + deposits, 32)`,
`next = (1 + deposits) mod 32` (rules check the small-count cases
against the handler and the general arithmetic at the type level).
(c) The reference-root rule compares against a sparse
divide-and-conquer evaluation ported from the program's own test
reference — no frontier code shared beyond `poseidon2`. (d)
Eviction is exact at the ring size: the rule replays the program's
own test sequence (initial + 32 pushes) against the real
`RootHistory<32>` type and pins `len`/`next`/membership; driving 33
full deposits through the handler for this purely arithmetic claim
is the suite's worst cost shape and is deliberately not how the
rule is built. Rules: `specs/p6_root_history.rs` (5).

## Cross-cutting notes

- **Error codes.** Anchor custom errors are `6000 + variant index`
  (`ZeroAmount` 6000 … `TransferNotEnabled` 6009). The harness reads
  them from the returned `anchor_lang::error::Error`; the encoding
  matches the W5 rehearsal's on-chain observations (UnknownRoot
  6004, ProofVerificationFailed 6006).
- **What a full pass would support.** "Properties 0–6 of the
  Aristotle spec are formally verified under assumptions A1–A6"
  — with P5's progress half and every A4-conditional lamport claim
  carved out until their summaries land. It would **not** support
  any claim about the circuit, the VK's provenance, Poseidon or
  Groth16 themselves, the v1 program, or mainnet readiness.
- **Duplicated-state hazard.** The spec suite is tied to *this*
  repo's crate, verified byte-identical to the deployed source at
  suite creation (RESULTS.md records the artifact hash check).
  If the two trees ever diverge, verdicts here describe this tree.
