# archive/legacy-program — frozen snapshot of the retired dark-protocol program

**Status: RETIRED per TRANSPLANT-SPEC §5.1–§5.3 (W1, 2026-11-17). Not a
workspace member, not buildable from the merged tree, kept for audit
history only.**

This is the pre-transplant `programs/dark-protocol` crate from
Solizardking/zolana-blockchain @ 3f497b1, moved here unchanged when the
Dark DeFi rewrite core took its place at `programs/dark-protocol`.

Why it was retired rather than adapted (TRANSPLANT-SPEC §1, §4):

- All 12 instructions returned `FeatureNotProductionReady` before any
  state change; behind the gates sat constructions that are not real:
  a SHA-256 Merkle tree, a SHA-256 "Pedersen" commitment, a nullifier
  derived from the commitment itself (linkable by construction), an
  XOR/hash-ECDH "encryption" with a fixed nonce, and two proof
  verifiers that never compute a pairing (`zk_proof.rs` checks lengths;
  `groth16.rs` builds its VK via `generate_test_vk()` and computes
  "scalar multiplication" as SHA-256). There is no Poseidon anywhere in
  this crate.
- Its state layout (Vec-based `NullifierSet` ≈ 320 KB single account,
  per-note accounts with on-chain ciphertexts) cannot be migrated and
  holds nothing worth migrating — the gates rejected every deposit.

Reference fragment: `dark-protocol/src/zcash/prf.rs` (PRF^expand with
correct Zcash personalization) is the one spec-shaped piece in this
snapshot. It is archived as reference only; it plays no role in the
merged program, whose contract derives keys with Poseidon in-circuit.

Retired program IDs associated with this snapshot (historical record —
do not resurrect): code-declared `Bf3jjD5Pojx5mHZVwJCWg7wC1oPg2hsn7ufsWaKoHv9E`;
the devnet ID claimed by old deployment docs,
`Frf98UwzjLqiFUTNVY8kEdZsUW3xCuuSm8MSayBSmk4X` (matches no declare_id! in
this snapshot; what binary sits there is unknown from source).
