# Poseidon on Solana — the Dark Protocol cost record

**Status: W5-NEW-1 fully closed by this track (2026-11-17).**
Program: `2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (devnet).
This document is the complete record of the Poseidon compute-unit
defect, its measurement, the fix, and the proof that the fix changed
no hash value. It is written for a future engineer or auditor who
needs to know *why* `poseidon2` looks the way it does, and what the
measured costs are. The rehearsal record that produced the on-chain
evidence is `../../W5-REHEARSAL.md`.

---

## 1. Symptom timeline

| When (2026-11-17) | Event |
|---|---|
| W5 rehearsal, first run | `initialize` aborts at the 1.4M CU cap at every budget. Cause: 60 on-chain Poseidon hashes (the depth-20 zero chain computed twice, plus a 20-fold root). Recorded as **W5-NEW-1 (Critical)**. |
| W5-NEW-1 fix (constants) | The 21 zero-chain values become a constant table (`src/zero_chain.rs`) and the Merkle fold short-circuits on the exact constant pair. Hash counts: initialize 60 → 0, deposit 41 → 21, withdraw 1 → 1. Upgraded in place; **`initialize` lands at 25,111 CU**; the pool exists, empty, root = z[20]. |
| Rehearsal resume | `deposit` (21 remaining hashes) still aborts at the 1.4M cap in simulation at 1.0M / 1.2M / 1.4M alike, and in preflight at 1.0M (999,850/999,850 consumed). The only derivable bound at the time was "> ~65K CU per hash all-in". |
| This track (Poseidon-cost) | Lab measurement (below) decomposes the per-hash cost, evaluates three candidate routes, implements the winner behind an unmodified-test equivalence gate, upgrades in place, and completes the full rehearsal: deposit, withdraw, replay, tamper, drain, relayer, SDK gate, indexer gate — all with the expected verdicts (Section 7). |

The trap in the original symptom: "21 hashes exceed 1.4M CU" invites
the inference that each hash costs ~65K CU and the total is just over
the line. The lab showed the truth is worse by more than an order of
magnitude — a *single* hash on the old path exceeds the entire
per-transaction cap, so `deposit` died on its first hash, not its
last.

## 2. Lab method

Measurements come from **real SBF execution**, never host
extrapolation (host execution has no CU meter — the reason this
defect was invisible to every test suite).

Two purpose-built throwaway lab programs were deployed to **devnet**
and metered with `simulateTransaction` (`unitsConsumed` + return
data) — the same runtime, syscall set, and CU cost model as
production:

- **Lab 1** (`9fKNMzHSmHFYhxVGNHdbnBoXmnyCWzhBsVLFdSfjKt2d`, closed
  after use, rent reclaimed): ops for parameter-construction-only,
  n-chained hashes on the current path, n-chained hashes with
  parameters built once (Route A), n-chained hashes via the
  `sol_poseidon` syscall (Route B), a both-paths differential op,
  and a Groth16 verify of the tree's sample proof against the real
  VK using the withdraw handler's exact verifier sequence.
- **Lab 2** (`HfGQRuXaVpiPxTj47QtJ7WmbHbTg3Q7jd3HYYKmfTUxn`, closed
  after use): a minimal diagnostic that calls
  `solana_poseidon::hashv` and the raw `sol_poseidon` syscall and
  returns status/error codes instead of unwrapping, so the failure
  surface is observable.
- **Host reference**: the program's own `poseidon2` code path
  (light-poseidon over the tree's `poseidon_params.rs`) compiled for
  the host, generating the expected outputs for the differential
  (pinned vectors + boundary values + 200 deterministic
  pseudo-random canonical pairs).

Method note, for honesty: the original plan metered on a local
validator / `solana-program-test`. On this machine the Agave 4.2
test-validator panics at startup (`assertion failed:
io_uring_supported()` — the sandbox blocks io_uring) and the
program-test dependency tree could not be resolved from the local
registry caches (two cargo registry-hash generations with
inconsistent sparse-index caches). Devnet simulation is the same
SBF execution with the production cost model, so the substitution
changes the venue, not the measurement. Simulation CU figures are
deterministic; repeated runs returned identical values.

## 3. Measured decomposition (old path)

| Component | CU | How measured |
|---|---:|---|
| `circom2_parameters()` construction, one call | **625,961** | Lab 1 op 0 (build parameters only; result XOR-folded into return data so the work cannot be elided). Identical across runs. |
| One Poseidon permutation, parameters pre-built | **> 773,889** | Lower bound: a Route A instruction (parameters built once + one permutation) consumed the full 1,399,850 CU budget and aborted; 1,399,850 − 625,961 = 773,889. |
| One hash, current path (construction + permutation, paid on every call) | **> 1,399,850** | Lab 1 op 1, n = 1: aborts at the cap. The old `poseidon2` rebuilt the parameters on *every* call, so every hash paid both rows above. |
| Groth16 verify (withdraw's non-hash cost) | **106,393** | Lab 1 op 5: the sample proof (`zk/proofs/sample_proof.bin`) verified against the program's real VK with the handler's exact sequence (including proof-A negation). Result byte: 1 (valid). |

So of the two hypotheses on record when this track opened —
(a) per-call parameter construction, (b) the permutation's software
`Fr` arithmetic under SBF — **both are true, and each one alone is
fatal**: construction is ~45% of the entire transaction budget, and
the permutation alone is >55%. light-poseidon's round function over
ark-ff field arithmetic, with a fresh heap allocation per MDS round,
is simply not viable inside SBF metering at any hash count ≥ 1.

## 4. Candidate routes

### Route A — build parameters once per instruction, thread them through

No math change; removes the repeated 625,961 CU construction.

- Measured: n = 1 already aborts at the 1,399,850 cap
  (625,961 + >773,889).
- Projected deposit: 625,961 + 21 × >773,889 ≈ **> 16.9M CU**.
- **Verdict: dead.** The permutation, not just the construction, is
  unaffordable in software under SBF.

### Route B — the runtime's native `sol_poseidon` syscall

`solana_poseidon::hashv(Parameters::Bn254X5, Endianness::BigEndian, &[a, b])`
— the validator computes circomlib Poseidon natively and charges the
syscall cost model.

Measured (Lab 1 op 3, chained hashes, whole-instruction CU):

| n | CU | | n | CU |
|---:|---:|---|---:|---:|
| 1 | 1,143 | | 21 | 17,523 |
| 2 | 1,962 | | 50 | 41,274 |
| 5 | 4,419 | | 100 | 82,224 |
| 10 | 8,514 | | | |

Marginal cost ≈ **819 CU per hash** (slope), ~324 CU fixed
instruction overhead in the lab harness. Lab 2's leaner entrypoint
measured a flat 1,115 CU for a complete one-hash instruction
(1,105 CU via the raw syscall).

Projected deposit hash portion: 21 × ~820 ≈ **17.2K CU**.

**Byte-identity evidence** (the route lives or dies on this — the
hash values are frozen by the circuit, the VK, the client-lib, the
indexer, and the on-chain zero-chain table):

- **KAT**: syscall H([0x01;32], [0x02;32]) =
  `0d54e1938f8a8c1c…829821990` — the value pinned by the program's
  own KAT test (from light-poseidon's documentation). ✅
- **Zero chain**: iterating the syscall H(z, z) from z = 0
  reproduces all 20 pinned table values bit-for-bit, ending at
  z[20] = `2134e76a…f22191f3e` — the live pool's root. ✅
- **Field pair**: syscall H(1, 2) =
  `115cc0f5…4417189a`, identical to the host reference. ✅
- **Boundary**: (r−1, r−1), (r−1, 0), (0, r−1) with the true Fr
  modulus r (see §6) all match the host reference bit-for-bit. ✅
- **Randomized differential**: 206 cases total (the pinned/boundary
  cases above + 200 deterministic pseudo-random canonical pairs),
  executed on devnet against the host reference: **206/206 match,
  0 mismatches**. ✅
- **Rejection domain**: inputs ≥ r are rejected by *both*
  implementations (light-poseidon: `InputLargerThanModulus`; the
  syscall: non-zero return code, surfaced by the crate as an
  error). The program maps either to the same
  `DarkError::PoseidonError`, and on-chain callers only ever pass
  canonical encodings (boundary-checked commitments, hash outputs,
  amounts, recipient limbs < 2¹²⁸), so this path is
  defense-in-depth only. ✅

**Verdict: winner.** ~819 CU/hash, values bit-identical, rejection
semantics identical.

### Route C — a leaner hand-written BN254 field implementation

Not implemented. Routes A and B were the only ones this track was
authorized to need: A failed on measurement, B reached the target
with ~40× margin, so C's trigger condition ("only if A and B both
fail") never fired. C remains the documented fallback if the
`sol_poseidon` syscall is ever deprecated or repriced: expect a
multi-week effort (Montgomery arithmetic, fixed-round unrolling, no
per-round allocation) and re-prove byte-identity from scratch
before any deployment conversation.

## 5. The change

`programs/dark-protocol/src/poseidon.rs`, `poseidon2` only:

- Body: light-poseidon evaluation →
  `solana_poseidon::hashv(Bn254X5, BigEndian, &[a, b])`, errors
  mapped to the same `DarkError::PoseidonError`.
- `programs/dark-protocol/Cargo.toml`: + `solana-poseidon = "2.3.13"`
  (one added lockfile package; its on-target dependencies were
  already in the tree's lock).
- Nothing else changed: no circuit, VK, client-lib, zero-chain
  constant, account-layout, or instruction-interface change.
  `poseidon_params.rs` is retained as the parameter-provenance
  record; nothing calls it at runtime anymore. On host (unit
  tests), the `solana-poseidon` crate evaluates the same function
  in software via its own light-poseidon fallback, so the host
  suite still pins the values.

**Equivalence gates (all run, tests unmodified):**

| Gate | Result |
|---|---|
| Host program suite (incl. KAT, zero-chain table test, 40-deposit frontier equivalence) | **20/20** |
| Client-lib suite | **34/34** |
| ZK end-to-end (`zk/test_withdraw.js`, incl. NEW-1 drain regression) | **13/13** |
| On-devnet differential vs the pre-change implementation | **206/206, 0 mismatches** (§4) |

**SBF artifact:** 278,040 bytes (was 323,096 — the software
permutation and its tables leave the hot path), sha256
`9718797889ab59d20bb721e4f6c15eaef0c24a2b86c4ee5e377b09fe6d63debb`,
built with cargo-build-sbf 4.1.0 / tools v1.58 / `--locked`,
**zero frame diagnostics**, byte-identical across two builds
(deterministic), copied into `target/deploy/` hash-verified.

**Upgrade:** in place on devnet, same program ID, deployer
authority, write-buffer route (buffer
`FoQMBUchF2XaJuktD42YdUJJm5nmF1qqidGFsCocfYCH`), signature
`2Y221pP13758nLxqvbW2JJpGMZpmTHEKZUjMLWxHmv239Zw9Ts4E1UuXfnEZjQaxDX5ExzxwRGjfwyGK3xUL4rHy`.
No ProgramData extension needed (278,040 ≤ 331,832 capacity).
Verified: `solana program dump` matches the artifact on all
278,040 artifact bytes (sha256 of the dump's artifact-length
prefix equals the artifact's), upgrade authority unchanged
(`RQJB3zHzphrNqxFXQVYLuELUoneMDGyErTX1P4jSouW`), and the pool
account was untouched (root z[20], 0 leaves, 0 totals before the
rehearsal resumed).

## 6. A trap for the next engineer: two different "Fr modulus" constants

This cost the lab real time; recording it so it costs nobody else
any. The byte array in the program's canonical-check *test*
(`poseidon.rs`, labeled "Fr modulus") is
`30644e72…97816a916871ca8d3c208c16d87cfd47`. **That is not the Fr
modulus.** The true scalar-field modulus — the one in
`ark_bn254::Fr::MODULUS`, the one `groth16-solana`'s
`is_less_than_bn254_field_size_be` compares against (and therefore
the one the program's production canonicality check enforces), and
the one both hash implementations validate inputs against — is
`30644e72…2833e84879b9709143e1f593f0000001`
(= 21888242871839275222246405745257275088548364400416034343698204186575808495617).
The test's byte array is a *larger* number, so its assertions
(reject the array value, reject 0xff…, accept 0 and 1) still pass
and production behavior is correct — but anyone who copies that
array as "the modulus" (as this lab initially did) will feed
genuinely non-canonical inputs to their probes and watch both
implementations reject them, apparently "at the boundary". They
are not at the boundary; they are past it.

## 7. Final CU table — as landed on devnet

Transaction totals from confirmed devnet transactions
(`computeUnitsConsumed`; the drivers set a 1,000,000 CU limit):

| Instruction | CU | Evidence |
|---|---:|---|
| `initialize` | 25,111 | Measured under the constants-fix build (tx `2kPGgbKh…`). The instruction performs no Poseidon evaluation in either build (post-constants), and the pool already exists, so it was not re-run under the syscall build. |
| `deposit` | **34,665 – 34,689** | Four rehearsal deposits (34,689 / 34,677 / 34,677 / 34,665) + SDK shield (34,665). Was: aborts at 1,400,000. |
| `withdraw` | **124,803 – 130,826** | Four honest withdraws (127,816 / 126,302 / 124,803 / 130,826). Composition: ~106.4K Groth16 verify (§3) + 1 recipient hash (~0.8K) + account/marker/payment work. |
| `withdraw` (tampered public input) | 123,104 consumed, then rejected | Full verify runs, then `ProofVerificationFailed` — the verify cost is paid before rejection by design. |
| `withdraw` (replay) | 10,565 consumed, then rejected | Dies at the nullifier-marker `init` ("already in use") before verify. |
| `withdraw` (drain attempt) | 14,252 consumed, then rejected | Dies at the root-history gate (`UnknownRoot`) before verify. |

Per-instruction verdicts with signatures: `../../W5-REHEARSAL.md`.

**Continuity proof that no value changed:** the pool was created
under the pre-syscall binary; every deposit and withdraw under the
syscall binary produced roots identical to the client-lib's
independent (software-Poseidon) tree at every step, and the
indexer — a third implementation path — reconstructed the same
final root from chain data alone (§7 of the rehearsal record).

## 8. Adjacent finding: the vault rent floor (not a hash issue)

The rehearsal surfaced a pool-economics edge that has nothing to
do with Poseidon but belongs in the record: a withdraw that would
leave the vault PDA below rent-exemption cannot land ("Transaction
results in an account with insufficient funds for rent"). In the
rehearsal this bit twice — the last honest withdraw (vault held
exactly the remaining accounted balance, 3,000,001 lamports
including the drain-test lamport) and the SDK gate's 500,000-lamport
withdraw to a *fresh* recipient account (500,000 < the 890,880
rent floor for a 0-byte account). Both were resolved as rehearsal
balance adaptations (deployer topped the vault with 0.01 SOL of
devnet funds; recipient pre-funded with 0.002 SOL) and are
recorded in the rehearsal log. **Production implication:** pool
operation should keep the vault rent-funded independent of note
accounting (e.g. a rent float established at initialize and never
accounted as deposit), and wallets/UIs paying fresh recipient
accounts should expect to fund the recipient's rent floor. No
program change was made for this in this track; it is a
finding for the dev to schedule.

## 9. Forward guidance — the W8 transfer circuit's hash budget

- **On-chain Poseidon is now cheap and should stay on the
  syscall.** At ~819 CU per 2-input hash, even a transfer
  instruction that re-folds a full depth-20 path *and* inserts a
  new leaf (≈ 41–45 hashes) budgets ≈ 34–37K CU of hashing —
  noise next to one Groth16 verify (~106K). The binding
  constraints for W8 are verify count, account count, and CPI
  overhead, not hashing.
- **Do not reintroduce software Poseidon on-chain** for any new
  instruction, in any amount. One hash of it exceeds the
  transaction cap (§3). There is no "just one hash" exception.
- **Circuit-side Poseidon is unaffected.** The prover (circomlib /
  snarkjs, off-chain) computes the same function at native speed;
  nothing in this record changes circuit costs, constraint counts
  (13,162 for withdraw), or the VK.
- **If `sol_poseidon` is ever deprecated or repriced**, Route C
  (§4) is the fallback and must be re-measured and re-proven
  before use; the differential harness pattern in this track
  (host reference vs on-chain probes over pinned + boundary +
  randomized vectors) is the template for that proof.
- **Multi-input hashes**: the program only ever evaluates the
  2-input form on-chain. The syscall supports up to 12 inputs
  (width ≤ 13); a future on-chain 3-input evaluation (e.g. the
  note commitment `Poseidon(owner_id, value, blinding)`) would
  cost on the order of one syscall call (~1.1K CU measured for
  width 3 instructions here) — measure before relying on it, and
  differential-test the exact width, since circomlib's padding
  rules are width-specific.
