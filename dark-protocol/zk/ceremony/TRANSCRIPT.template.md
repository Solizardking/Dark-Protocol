# Dark Protocol — Groth16 Phase-2 Ceremony Transcript

**Status:** TEMPLATE — the production ceremony has not started. This file is the
skeleton the coordinator fills in live, hop by hop, as the ceremony runs. A filled
copy of this file, published in full, is the ceremony's claim to trust (together
with independent re-verifications of it). If the ceremony is invalidated, this
transcript is marked INVALID with the reason — it is never deleted.

## Header (Day 0 — filled before the first contribution)

| Field | Value |
|---|---|
| Protocol | Dark Protocol — shielded pool, withdraw circuit |
| Circuit | `circuits/withdraw.circom` — 13,162 constraints, 4 public inputs, BN254 / Groth16 |
| r1cs | `zk/build/withdraw.r1cs` |
| r1cs sha256 | `a446c630044aa7ea5472762e15824d80ef9ba52238a189b6b27149f61d75cab4` |
| Circuit freeze | CONFIRMED Day 0 — any circuit change after this point invalidates the ceremony |
| Phase 1 (APPROVED 2026-11-18) | Hermez perpetual Powers of Tau, `powersOfTau28_hez_final_15.ptau` — PPOT contributions 1–54 + public randomness beacon, prepared per power by the Hermez (Polygon) team |
| ptau power | 2^15 (32,768 max constraints; withdraw uses 13,162) |
| ptau BLAKE2b-512 (pinned, snarkjs README) | `982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e` |
| ptau file sha256 (as imported) | `3ef2ecc5b75d687048cf2d59195119b42fb07c5af639c5f283d84bfa69829e7f` |
| ptau location in tree | `zk/keys/pot_hermez15.ptau` |
| ptau `powersoftau verify` | ☐ PENDING — record "Powers Of Tau file OK!" + contribution count here before Day 1 |
| Coordinator | _name / handle_ — **logistics only, does NOT contribute** |
| Contributors | 5 slots (C1–C5), minimum acceptable 3, from ≥3 independent organisations/households |
| Beacon | **drand mainnet round TBD** — the exact round number is pre-announced here BEFORE contributions open; its output must land AFTER contributions close; applied via `zkey beacon` with iteration exponent 2^10 |
| Beacon round (pre-announced) | ☐ TBD — fill before the first contribution |
| Transcript publication | ☐ TBD — URL where this filled transcript + per-hop updates are published |
| Ceremony start (Day 0) | ☐ TBD — date |

## Contribution chain

Seed: `withdraw_0000.zkey` = `snarkjs groth16 setup` output over the r1cs + the
Hermez ptau above (0 contributions). Each hop adds exactly one contribution.
Publish each row **as the hop happens** — name, contribution hash, output zkey
sha256 — not in a batch at the end.

| Hop | Slot | Contributor (public name) | Date | Input zkey sha256 | Contribution hash | Output zkey | Output zkey sha256 |
|---|---|---|---|---|---|---|---|
| seed | — | coordinator (setup only, no entropy) | | — | — | `withdraw_0000.zkey` | |
| 1 | C1 | **8bit** (the dev, on his own machine — contributor label is a handle; no legal name is used anywhere in this ceremony) | | | | `withdraw_0001.zkey` | |
| 2 | C2 | _independent developer — TBD_ | | | | `withdraw_0002.zkey` | |
| 3 | C3 | _external security researcher / auditor — TBD_ | | | | `withdraw_0003.zkey` | |
| 4 | C4 | _independent developer, different org — TBD_ | | | | `withdraw_0004.zkey` | |
| 5 | C5 | _optional public community contributor — TBD_ | | | | `withdraw_0005.zkey` | |
| final | beacon | drand round _TBD_ | | | | `withdraw_final.zkey` | |

Per-hop coordinator check (record ✓ per hop): incoming sha256 matched this
transcript before the hop · `ZKey Ok!` confirmed after the hop · contributor
published their entropy-destruction statement.

## Beacon record (fill when it lands)

| Field | Value |
|---|---|
| Source | drand mainnet |
| Pre-announced round | ☐ TBD |
| Round output (hex used as beacon hash) | |
| Iterations exponent | 10 (2^10) |
| Beacon contribution hash (from `zkey beacon` output) | |
| Final zkey sha256 | |
| Final `vk_solana.bin` sha256 | |
| Final verify | `ZKey Ok!` — ☐ |

## Independent verifications

At least two people who did **not** contribute must run
`zk/ceremony/verify-transcript.sh` over the full chain (including the beacon
hop) and be recorded here with their result.

| Verifier | Contributor? | Date | Result |
|---|---|---|---|
| | no | | |
| | no | | |

## VK handoff record (separate, gated step — see RUNBOOK.md step 7)

| Field | Value |
|---|---|
| VK byte-compare vs `programs/dark-protocol/src/vk.rs` | must report **DIFFERS** |
| Acceptance gate on spliced tree | program `cargo test --lib` ☐ 20/20 · client-lib `npm test` ☐ 34/34 · ZK e2e `node test_withdraw.js` ☐ 13/13 |
| Devnet re-rehearsal with production VK | ☐ deposit → withdraw → replay-reject, signatures recorded in W5-REHEARSAL.md |
| Spliced by / date | |

## Invalidation rules (any one kills this ceremony)

- any hop fails `zkey verify` (no `ZKey Ok!`);
- a hop adds other than exactly one contribution, or any earlier contribution's
  name/hash differs between hops (history rewritten);
- a published contribution hash or zkey sha256 does not match the chain;
- the beacon applied is not the pre-announced drand round, or was applied
  before contributions closed;
- the ptau or r1cs used differs from the header above (hash mismatch);
- enough contributor entropies are discovered recorded/leaked that the
  at-least-one-honest threshold is in doubt (if every entropy leaks, the keys
  are compromised regardless of this transcript's validity).

On invalidation: stop, mark this transcript **INVALID** with the reason in the
same place it is published, quarantine the chain directory, restart from a
fresh `withdraw_0000.zkey`. Never delete an invalid transcript.
