# FINDINGS-MAP — Dark Protocol v2 (settlement program rewrite)

Maps every relevant finding from `~/workspace/dark-defi-audit/AUDIT.md` to
how this rewrite (`~/workspace/dark-defi-rewrite/program/`) closes it, or to
the track that owns it. "Closed" means closed *in this program's code*. The
real verifying key has landed (see C-2) — twice: the original ceremony,
and the 2026-11-17 re-ceremony for the NEW-1 circuit change described
under H-7. The re-audit (`../REAUDIT.md`) is the authority on closure
verdicts; this map records the mechanisms.

## Closed by this rewrite

### C-1 — Settlement program verifies nothing; anyone can drain any note
**Closed.** There is no `ShieldedNote` account and no plaintext note data
anywhere. `withdraw` pays only after, in order: (1) the supplied root is in
the pool's on-chain root-history ring, (2) a Groth16 proof verifies over
public inputs `[root, nf, recipient, amount]` where `recipient` is computed
by the program from the payee account's pubkey (a proof cannot be redirected
to another payee), (3) the ledger solvency invariant
`amount ≤ total_deposited − total_withdrawn` holds, and (4) the nullifier
PDA `["nf", nf]` is created by the same transaction. A caller with no proof
for a note they own cannot move a single lamport; the v1 attack (read a
note account, withdraw with a random nullifier) has no analogue — there is
nothing to read. The drain *outcome* the re-audit later found through the
deposit side (NEW-1: an under-funded commitment withdrawn at face value) is
closed by the bound leaf described under H-7, with the drain as a
regression test in `zk/test_withdraw.js` and
`client/test/withdraw-integration.test.js`.

### C-6 — Nullifier is not PRF^nf; random/zero nullifiers accepted
**Closed (program side).** Per the shared contract, `nf = Poseidon(nk,
leaf_index)` is proven inside the withdraw circuit: `nf` is a public input,
so a wrong or random `nf` fails verification. On-chain, the nullifier's
byte encoding must be canonical (the groth16-solana verifier rejects public
inputs ≥ the field modulus), so each field element has exactly one PDA —
double-spend is impossible by construction via Anchor `init` on
`["nf", nf]`. Deriving `nf` correctly is the circuit's job (ZK track); this
program is the enforcement point.

### H-7 — Commitments are plain Blake3 hashes; nothing binds value
**Closed (program side) — at BOTH boundaries.** `cm = Poseidon(owner_id,
value, blinding)` per the shared contract (constructed circuit/client-side):
the commitment itself binds the value inside the note system. But value
conservation is a property of the pool boundary, and the first version of
this rewrite checked only the exit — the re-audit's NEW-1 (Critical)
showed the entrance was unauthenticated: `deposit(amount, cm)` inserted
raw `cm`, so a commitment crafted over an arbitrary V, deposited with
1 lamport, could be withdrawn at V with a fully valid proof, draining the
pool up to total honest deposits.

The fix binds value at the entrance as well: `deposit` now computes the
Merkle leaf as `leaf = Poseidon(cm, amount)` on-chain, from the lamports
it actually pulled, and inserts the bound leaf. The withdraw circuit
recomputes the identical bound leaf from the note opening — its
commitment is computed over the public `amount` — and proves membership
of the bound leaf. A note is therefore spendable only for exactly the
amount deposited against its commitment; an under-funded commitment has
no openable leaf in the tree at any amount. Regression coverage: the
drain test in `zk/test_withdraw.js` (1-lamport deposit claiming
V = 1,000,000 fails to prove; an honest note in the same tree still
withdraws in full), the program-side `deposit_inserts_amount_bound_leaf`
unit test, and the client integration drain check. No instruction accepts
a caller-asserted note value.

### M-10 — Amounts go on-chain in plaintext (program half)
**Closed as far as a Solana program can close it.** The program stores no
per-note amounts, no ciphertexts, no depositor records — only commitments,
Merkle state, and aggregate totals. Deposit/withdraw *lamport movements*
are inherently public on Solana (the transfers themselves are visible);
what the design hides is note ownership and deposit↔withdrawal linkage,
which is the pool's actual privacy property. (The wallet half of M-10 —
sender storing the recipient's note as its own — is the TS track's.)

### M-11 — Commitment tree is a toy SHA-256 list maintained by the SDK
**Closed.** The tree lives on-chain: a depth-20 incremental Poseidon
Merkle tree (frontier) inside the Pool account, over deposit-bound leaves
`Poseidon(cm, amount)` (see H-7). Roots are computed by the
program on every deposit and kept in a 32-entry history ring; proofs anchor
to program-produced roots only. Unit tests verify frontier insertion
against an independent divide-and-conquer reference implementation.

### L-8 — Randomness substituted for derivation (program half)
**Closed.** Every cryptographic object this program touches is derived or
bound: commitments are checked canonical field elements, nullifiers are
proof-bound derivations, roots are computed on-chain, the recipient input
is derived from the payee's pubkey. The program consumes no randomness.

### I-5 — Documentation claims the code does not support (program half)
**Closed.** This program's docs state the opposite of v1's claims where
they differ: the verifying-key status is labelled accurately in
`src/vk.rs` (real key, from a local single-contributor DEV ceremony —
production requires an MPC ceremony), in the crate docs, and *on-chain*
(`Pool.vk_is_placeholder` = false, set at initialize and emitted in the
`ProtocolInitialized` event).

## Closed jointly with the ZK track (program side done)

### C-2 — ZK proofs are placeholders; verifier accepts any 256 bytes
**Closed.** Verification is real Groth16 over BN254 via `groth16-solana`
and the alt_bn128 syscalls — full pairing check, public-input preparation,
and field-size checks, fail-closed on any error. There is no length check,
no placeholder acceptance, no bypass. The ZK track's real circuit and
verifying key have landed: `src/vk.rs` carries the generated constants
(byte-identical to the ZK track's `vk_solana.bin` export),
`VK_IS_PLACEHOLDER` is `false`, and the e2e suite proves real proofs
verify and tampered ones reject. The key is from a local single-contributor
DEV ceremony (re-run 2026-11-17 for the NEW-1 circuit change); production
requires an MPC ceremony and a fresh VK — see `src/vk.rs`.

## Owned by other tracks (not this program)

- **C-3, C-4, C-5, H-5, H-6** — the TS Sapling stack (no ZIP-32, hash
  "keys", broken note encryption). Superseded by design: the rewrite's
  shared contract replaces Sapling with the BN254/Poseidon note scheme
  (`nk`, `owner_id`, `cm`, `nf` above). The TS client/crypto rewrite is
  the ZK/TS track's work; this program neither uses nor trusts any of the
  old TS cryptography.
- **H-8, M-8, M-9, M-12** — TS wallet/SDK defects (string-compare multisig,
  view-wallet divergence, forgeable payment proofs, BIP32/Ed25519 key
  reuse). Client track.
- **C-1's TS half / the `demoMode` gate** — the old TS default is moot for
  this program: there is no mode in which the on-chain checks are skipped.
- **Scope A findings (H-1–H-4, M-1–M-7, L-1–L-7, I-1–I-4)** — Dark
  Percolator / prop-vault / private-ledger / mm-oracle: different programs,
  different track. (Process lesson from H-4 *is* applied here: the program
  id in `src/lib.rs` is a hash-derived placeholder that no keypair exists
  for; a fresh program keypair must be generated and the id replaced before
  any deployment.)
- **Finding #0** — deployed-binary provenance. Nothing is deployed by this
  track; when deployment happens it must be from committed source with the
  build hash recorded, which is an ops step for the deploy track.

## Deliberate divergences from a naive "port the old program" rewrite

- **`transfer` is a fail-closed stub** (`TransferNotEnabled`). The verify →
  nullify → append pattern is established by `withdraw`, but a transfer
  circuit's public-input layout is not in the shared contract yet; shipping
  a guessed layout would either be unverifiable or wrong. It never
  silently succeeds.
- **Recipient encoding v1 was defined here** (`poseidon::recipient_field`:
  pubkey split into two 16-byte big-endian limbs, `Poseidon(hi, lo)`)
  because the ZK track's README had not landed. It has since been checked
  against the ZK track's actual code — `zk/circuits/withdraw.circom` and
  `zk/scripts/darknote.js` (`recipientFromPubkey`) implement exactly this
  encoding, and the circuit's public inputs are `[root, nf, recipient,
  amount]` at depth 20, matching this program. No divergence. (The ZK
  track's README and exported VK have since landed; the VK drop-in is
  complete — see C-2.)
- **No admin fund path.** The recorded `authority` cannot move funds,
  pause, or upgrade anything in v1. The old program's flaw class
  ("whoever asks, receives") is excluded structurally rather than by
  adding better checks to a privileged path.
