# Dark Protocol — verification specification for Aristotle

This file states the properties we ask Aristotle to verify about the Rust
crate in this directory. Please verify the code exactly as submitted.

## The program

`dark_protocol` is a Solana program (Anchor 0.32.1, program id
`2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL`, built for
`target_os = "solana"`): a Groth16-verified shielded SOL pool over BN254
with circomlib Poseidon hashing. It holds user SOL in a vault PDA and pays
out only against a zero-knowledge proof verified on-chain.

Files and what they contain:

- `src/lib.rs` — the instruction handlers `initialize`, `deposit`,
  `withdraw`, and `transfer` (a fail-closed stub); the Anchor account
  structs `Initialize`, `Deposit`, `Withdraw`, `TransferAccounts`; the
  state structs `Pool` and `NullifierMarker`; the events
  `ProtocolInitialized`, `NoteDeposited`, `NoteWithdrawn`.
- `src/merkle.rs` — `Frontier<const DEPTH: usize>` (incremental Merkle
  tree, `TREE_DEPTH = 20`, `MAX_LEAVES = 1 << 20`), `RootHistory<const
  SIZE: usize>` (root ring, `ROOT_HISTORY_SIZE = 32`), `zero_chain`,
  `empty_root`.
- `src/poseidon.rs` — `poseidon2` (2-input circomlib Poseidon over BN254,
  big-endian), `recipient_field`, `amount_to_field`,
  `is_canonical_field_element`, `negate_proof_a`.
- `src/vk.rs` — the Groth16 verifying key constants (`VERIFYING_KEY`,
  `NR_PUBLIC_INPUTS = 4`, `VK_IS_PLACEHOLDER = false`).
- `src/errors.rs` — the `DarkError` enum: `ZeroAmount`, `ZeroCommitment`,
  `NonCanonicalFieldElement`, `TreeFull`, `UnknownRoot`,
  `InsufficientPoolBalance`, `ProofVerificationFailed`,
  `ArithmeticOverflow`, `PoseidonError`, `TransferNotEnabled`.

Key state fields of `Pool`: `authority: Pubkey`, `current_root: [u8; 32]`,
`root_history: [[u8; 32]; 32]`, `history_next: u8`, `history_len: u8`,
`frontier: [[u8; 32]; 20]`, `next_leaf_index: u64`,
`total_deposited: u64`, `total_withdrawn: u64`, `vk_is_placeholder: bool`,
`bump: u8`, `vault_bump: u8`.

## Preconditions and modelling assumptions (apply to every property)

1. Accounts have passed Anchor's validation for the handler's context
   struct: the `pool` account is the PDA with seeds `[b"pool"]`, the
   `vault` account is the PDA with seeds `[b"vault", pool.key()]`, signer
   and mutability flags are as declared in the context structs, and in
   `withdraw` the `nullifier_marker` account is created by Anchor's `init`
   with seeds `[b"nf", nf]` and payer `fee_payer` before the handler body
   runs (if that account already exists, account creation fails and the
   whole transaction aborts before the handler executes).
2. The Solana runtime and the system program behave as their assumed
   contracts state (a system-program transfer of `amount` lamports either
   moves exactly `amount` from the source to the destination account, or
   fails and aborts the transaction; any error anywhere in an instruction
   aborts the whole transaction and rolls back every account change,
   including account creation).
3. Field elements are 32-byte big-endian encodings; "canonical" means the
   encoded value is strictly less than the BN254 scalar field modulus,
   as checked by `is_canonical_field_element`.
4. Amounts are `u64` lamport values. A "valid input" to a handler is any
   input whose accounts satisfy precondition 1; individual properties
   state any further input conditions they need.

## External dependencies — the verification boundary we expect

Two security-critical operations are delegated to Solana syscalls through
external crates, and we state their contracts explicitly because we do
**not** ask Aristotle to prove the cryptography itself:

- **Poseidon hashing.** `poseidon2` delegates to the runtime's native
  `sol_poseidon` syscall via the `solana-poseidon` crate (Bn254 x^5,
  big-endian). Treat `poseidon2(a, b)` as a deterministic function
  `[u8; 32] × [u8; 32] → [u8; 32]` that fails (returns an error, mapped to
  `DarkError::PoseidonError`) only when an input is not a canonical field
  element. Where a property needs two different inputs to give different
  outputs (Property 3), that step rests on the collision resistance of
  the Poseidon permutation, which we state as an assumption, not
  something to prove.
- **Groth16 verification.** `withdraw` step (3) calls
  `Groth16Verifier::new(...)` and `verifier.verify()` from the
  `groth16-solana` crate, which uses the runtime's alt_bn128 syscalls.
  Treat `verify()` as an oracle with this contract: it returns `Ok(())`
  only if the proof (with proof A negated by `negate_proof_a`) is a valid
  Groth16 proof for the public inputs `[root, nf, recipient, amount]`
  (in that order) under `vk::VERIFYING_KEY`, and an error otherwise.
  Groth16 soundness itself, and the correctness of the withdraw circuit
  that the verifying key belongs to, are out of scope.

If a property below cannot be proved under these stated contracts, please
report it as refuted or boundary-limited (naming the dependency it rests
on) rather than silently assuming a stronger contract. Compute-unit
usage and transaction termination are out of scope for every property.

## Property 0 — No undefined behaviour, no panics on valid inputs

For every instruction handler (`initialize`, `deposit`, `withdraw`,
`transfer`) and every helper they reach (`Frontier::new`, `Frontier::root`,
`Frontier::insert`, `RootHistory::new`, `RootHistory::push`,
`RootHistory::contains`, `zero_chain`, `poseidon2`, `recipient_field`,
`amount_to_field`, `is_canonical_field_element`, `negate_proof_a`):
execution is free of undefined behaviour, and the handler does not panic
on any valid input (precondition 4). In particular: all indexing into
fixed-size arrays and into the fixed `[u8; 256]` proof buffer
(`proof[64..192]`, `proof[192..256]`) is in bounds; totals are updated
only through `checked_add` / `checked_sub`; the only divisions and
remainders are by non-zero constants (`idx /= 2`, `% SIZE` with
`SIZE = 32`, `% 2`).

## Property 1 — Lamport conservation and ledger integrity

For any finite sequence of instructions executed against one `Pool`
created by `initialize`, interleaved in any order:

(a) `Pool.total_deposited` always equals the sum of the `amount`s of all
    successful `deposit` instructions, and `Pool.total_withdrawn` always
    equals the sum of the `amount`s of all successful `withdraw`
    instructions. No other instruction changes either total.
(b) `total_withdrawn ≤ total_deposited` holds after every instruction.
    (In `withdraw`, `outstanding = total_deposited
    .checked_sub(total_withdrawn)` and the handler requires
    `amount ≤ outstanding` before it adds `amount` to
    `total_withdrawn`.)
(c) The vault PDA's lamport balance is always at least
    `total_deposited − total_withdrawn`. It equals that value unless a
    third party has transferred lamports directly to the vault address
    outside this program; such donations increase the vault balance but
    never change the ledger totals in (a), so they can never make an
    otherwise-invalid withdrawal valid.
(d) `deposit` moves exactly `amount` lamports from the `depositor`
    signer to the vault — via one system-program transfer CPI — and if
    that transfer fails, no `Pool` field changes (the handler performs
    the transfer before mutating any state).
(e) `transfer` never moves lamports and never changes any `Pool` field:
    it always returns `DarkError::TransferNotEnabled`.

## Property 2 — Withdraw gating: payment only after every check, marker before money

In `dark_protocol::withdraw`, the system-program transfer that pays
`amount` lamports from the vault to the `recipient` account (step (5) of
the handler) is executed only if all of the following were checked
earlier in the same instruction, in this order:

1. `amount > 0` (otherwise `DarkError::ZeroAmount`);
2. the supplied `root` is in the pool's root history:
   `RootHistory::contains(&root)` is true (otherwise
   `DarkError::UnknownRoot`);
3. `amount ≤ total_deposited − total_withdrawn` (otherwise
   `DarkError::InsufficientPoolBalance`);
4. Groth16 verification succeeds: `Groth16Verifier::verify()` returns
   `Ok(())` for the public inputs `[root, nf, recipient, amount]`, where
   `recipient` is `poseidon::recipient_field(&ctx.accounts.recipient
   .key())` — computed by the program from the recipient account in this
   transaction, never supplied by the caller — and `amount` is encoded
   by `amount_to_field(amount)` (otherwise
   `DarkError::ProofVerificationFailed`).

Additionally:

5. Before the payment, the handler writes the `NullifierMarker` fields
   (`marker.nf = nf`, `marker.slot = Clock::get()?.slot`,
   `marker.bump = ctx.bumps.nullifier_marker`). By precondition 1 the
   marker account was created by this very instruction, so reaching the
   payment step implies no marker for this `nf` existed before — i.e.
   this nullifier has never been spent. A second `withdraw` with the
   same `nf` aborts at account creation, before the handler runs.
6. If any step fails, the transaction aborts and the marker creation is
   rolled back with everything else: a rejected proof never consumes
   (burns) a nullifier.

This property is about the gating, ordering, and atomicity in our code.
It rests on the stated contracts of `Groth16Verifier::verify()` and
`poseidon2` (see the boundary section): we do not ask for a proof of the
pairing check itself.

## Property 3 — Deposit binding: the inserted leaf commits to the lamports actually pulled (the NEW-1 property)

In `dark_protocol::deposit(amount, cm)`:

(a) The handler enforces `amount > 0` (`ZeroAmount`), `cm ≠ [0u8; 32]`
    (`ZeroCommitment`), and `is_canonical_field_element(&cm)`
    (`NonCanonicalFieldElement`), and requires
    `pool.next_leaf_index < MAX_LEAVES` (`TreeFull`), all before any
    state change or transfer.
(b) The leaf inserted into the Merkle tree is exactly
    `leaf = poseidon2(&cm, &amount_to_field(amount))`, computed by the
    program from its own instruction arguments before the transfer.
    It is never `cm` itself, and never a value bound to any amount other
    than this instruction's `amount`.
(c) The `amount` bound into the leaf is the same value passed to the
    system-program transfer CPI in the same instruction — the lamports
    actually pulled from the depositor. There is no code path in which
    the bound amount and the transferred amount can differ.
(d) `Frontier::insert` is called with exactly that `leaf`, at leaf index
    `pool.next_leaf_index` as it was on entry, and the emitted
    `NoteDeposited` event carries that same `leaf` and `leaf_index`.

Under the stated collision-resistance assumption on `poseidon2`, (b) and
(c) together imply: a commitment deposited with a 1-lamport transfer can
never produce the leaf that a withdraw proof for a larger amount opens,
so depositing a commitment crafted over an arbitrary value `V` while
paying fewer than `V` lamports can never make `V` withdrawable. (This
was audit finding NEW-1; we want it as a theorem about the handler, not
only as a regression test.)

## Property 4 — Authority impotence: no signer-only path moves vault funds

(a) `Pool.authority` is written exactly once, by `initialize`, from the
    `authority` signer. No handler reads `pool.authority` to authorise
    anything, and no instruction lets any signer — including the
    authority — debit the vault by virtue of signing.
(b) The only lamport debit of the vault anywhere in the program is the
    step-(5) transfer CPI in `withdraw`, signed with the vault PDA seeds
    `[b"vault", pool.key().as_ref(), &[pool.vault_bump]]`, and by
    Property 2 it is preceded by the root, solvency, and proof checks.
(c) `deposit`'s only transfer moves lamports from the signing
    `depositor` into the vault. `initialize` moves no lamports except
    the rent the `authority` payer funds for creating the `Pool` account
    itself. `transfer` moves nothing (Property 1e).
(d) In `withdraw`, neither the `fee_payer` (who funds the nullifier
    marker's rent) nor the `recipient` (not a signer) gains any right
    over the payout beyond what Property 2 states: the payout destination
    is fixed by the proof's `recipient` public input, which the program
    computes from the recipient account itself.

## Property 5 — Withdraw progress and error classification (the headline property)

**Progress.** A `withdraw(proof, root, nf, amount)` instruction succeeds
— returns `Ok(())`, creates the `NullifierMarker`, and pays exactly
`amount` lamports from the vault to `recipient` — whenever ALL of the
following conditions hold:

1. the pool was created by `initialize` and the accounts satisfy
   precondition 1;
2. `amount > 0` and `amount ≤ total_deposited − total_withdrawn`;
3. `root ≠ [0u8; 32]` and `RootHistory::contains(&root)` is true for the
   pool's current `root_history` / `history_next` / `history_len`;
4. `Groth16Verifier::verify()` returns `Ok(())` for the public inputs
   constructed exactly as in Property 2(4) (this is the stated oracle
   contract — the proof is valid for `[root, nf,
   recipient_field(recipient), amount_to_field(amount)]` under
   `vk::VERIFYING_KEY`);
5. no `NullifierMarker` account already exists for seeds
   `[b"nf", nf]`;
6. the system-program payout transfer can succeed under the runtime's
   assumed contracts: the vault's lamport balance is at least `amount`,
   the vault's post-payment balance is either zero or at least the
   rent-exemption minimum for a zero-data account, and the recipient's
   post-credit balance is at least the rent-exemption minimum for its
   data size (the rent-floor conditions — in our devnet rehearsal these
   were the only runtime conditions that ever blocked a valid withdraw);
7. `Clock::get()` succeeds.

Under conditions 1–7, no check in our own code returns an error: prove
that none of the handler's `require!`s can fire, no checked arithmetic
fails, and no other `DarkError` is reachable on this path.

**Error classification.** For every error a `withdraw` instruction can
return, identify its origin as exactly one of: (i) caller input,
(ii) pool ledger state, (iii) the proof/verifier (including the stated
external contracts), (iv) Anchor account validation, or (v) the runtime
/ system program. We expect the classification to come out as:
`ZeroAmount` — caller input; `UnknownRoot` — caller input (a root this
pool never produced, or one evicted from the 32-root ring);
`InsufficientPoolBalance` — pool ledger state versus caller amount;
`ProofVerificationFailed` — verifier/proof; marker-already-exists — 
account validation, i.e. a caller replaying a spent nullifier;
rent/balance transfer failures — runtime. In particular, prove that
`DarkError::ArithmeticOverflow` is **unreachable** in `withdraw` given
the invariant `total_withdrawn ≤ total_deposited` and the handler's
check order, or exhibit a counterexample input if it is reachable.

## Property 6 — Root-history and frontier integrity

(a) After `initialize`: `pool.current_root` equals
    `Frontier::<TREE_DEPTH>::new().root()` — the empty-tree root
    `z[20]` of `zero_chain` — and the root history contains exactly that
    root (`history_len = 1`, and `RootHistory::contains` returns true
    for it and false for every other value, including `[0u8; 32]`,
    which `contains` always rejects).
(b) After every successful `deposit`: `pool.current_root` equals the
    value returned by that deposit's `Frontier::insert(leaf)`;
    `RootHistory::push` has appended exactly that root; the ring
    invariants hold — `history_len = min(1 + number_of_deposits, 32)`,
    `history_next = (1 + number_of_deposits) mod 32`, and every valid
    ring entry is a root the program itself produced (the initial root
    or a value returned by `Frontier::insert` in some earlier deposit).
    No other instruction adds entries to the ring.
(c) Frontier consistency: after any sequence of `n` successful deposits
    (`n < MAX_LEAVES`), `pool.next_leaf_index = n`,
    `pool.frontier` equals the `Frontier` state after inserting the
    n bound leaves in order, and `pool.current_root` equals the root of
    the depth-20 Poseidon Merkle tree over those n leaves (with empty
    subtrees filled by the zero chain), as computed by a from-scratch
    divide-and-conquer evaluation of the tree — not merely by the
    frontier algorithm restating itself.
(d) Eviction: once more than 32 roots have been pushed after a given
    root, `RootHistory::contains` returns false for it — the set of
    roots a withdraw may anchor to (Property 2(2)) is always exactly
    the last 32 roots the program produced.

Properties 6(b)–(d) rest on `poseidon2` as a deterministic function
(boundary section); they do not need its collision resistance, only
that the same inputs give the same outputs in the frontier fold, the
reference evaluation, and `RootHistory`.
