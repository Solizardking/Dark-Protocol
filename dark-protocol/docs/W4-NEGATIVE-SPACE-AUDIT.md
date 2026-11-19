# W4 — Negative-space audit of the merged tree

**Date:** 2026-11-17 · **Scope:** every surviving surface of the merged
tree (`programs/`, `sdk/`, `client-lib/`, `zk/`, `indexer/`,
`dark-wallet/src/`, `rail-worker/`). "Surviving" excludes the frozen
archives (`dark-protocol/archive/`, repo-root `archive/`), which are
expected to contain the retired machinery and are not buildable from
any workspace. Method: grep-level evidence, run on the merged tree
after W1–W3 + W6 edits; each item names the §1.4/§1.7 finding it closes.

| # | Dangerous thing | Evidence of absence | Status |
|---|---|---|---|
| 1 | `generate_test_vk()` / test-pattern VK (§1.4 groth16.rs) | `grep -rn generate_test_vk` over surviving surfaces: **0 hits**. VK is pinned constants in `programs/dark-protocol/src/vk.rs`, generated from the ceremony via the ZK export pipeline; `VK_IS_PLACEHOLDER = false` | ABSENT |
| 2 | Caller-supplied / floating VK (zk-clawd class, INTEGRATIONS) | No instruction in the merged program takes key material: signatures are `initialize()`, `deposit(amount, cm)`, `withdraw(proof, root, nf, amount)`, `transfer(proof, root, nf, cm1, cm2)` (generated IDL, `sdk/typescript/src/idl/`). Client-side `verifySpendProof` reads the landed vkey artifact for local checks only; on-chain verification uses the pinned constants | ABSENT |
| 3 | Fake verifiers — length/non-zero checks, hash "EC ops" (§1.4 zk_proof.rs, groth16.rs) | `grep -rn verify_zk_proof` surviving: **0 hits**; `find -name zk_proof.rs -o -name groth16.rs` outside archives: **0 files**; `scalar_mul`/`point_add` greps: 0 hits in code (one hit is this audit's companion migration note *naming* the fakes). Real verification = groth16-solana over alt_bn128 inside `withdraw` only | ABSENT |
| 4 | `FeatureNotProductionReady` gates hiding fake interiors (§1.2) | `grep -rln FeatureNotProductionReady` surviving: **0 files**; hits exist only under `archive/legacy-program/`. The merged program's safety is structural: no fund path exists without the withdraw gate order | ABSENT |
| 5 | SHA-256 "Pedersen" commitment / SHA-256 Merkle tree (§1.4) | Program crate: `grep -rni "sha256\|sha2\|blake"` over `programs/dark-protocol/src/`: the only hit is a comment explaining the placeholder program ID is sha256-*derived* (an ID, not a construction). Commitments/tree are circomlib Poseidon (light-poseidon on-chain, circomlibjs in client-lib, circuit in zk/) | ABSENT |
| 6 | Nullifier derived from the commitment (linkable, §1.4/§4) | client-lib `poseidon.js`: `nullifier(nk, leafIndex) = poseidonHash([nk, leafIndex])`; program derives nothing — it records the proven nf in a marker PDA. No surviving code hashes a commitment into a nullifier | ABSENT |
| 7 | XOR / hash-ECDH "encryption", fixed nonce (§1.4) | Greps for the fixed nonce + XOR construction patterns: 0 hits in code (one lockfile false positive on the substring "xor" in "exorbitant"). client-lib encryption = X25519 (@noble/curves) + ChaCha20-Poly1305 (@noble/ciphers), fresh ephemeral key per note | ABSENT |
| 8 | Mock proofs / placeholder signatures (§1.4, original audit C-2) | `grep -rn "generate_mock_proof\|mock_proof\|placeholder-transaction"`: **0 hits**. Client prover fails closed with `ArtifactMissingError` when artifacts are missing (test-proven in client-lib suite) | ABSENT |
| 9 | Standalone verify instruction (§5.2 W4) | IDL instruction list = initialize/deposit/withdraw/transfer. No verify-only endpoint | ABSENT |
| 10 | Public Merkle-update path (§1.2 #10) | `grep -rn update_merkle_tree` surviving: **0 hits**. Leaves enter only via `deposit` | ABSENT |
| 11 | Per-note accounts / Vec `NullifierSet` (§1.3, §1.7) | Program account structs: exactly `Pool` and `NullifierMarker` (lib.rs). `grep -rn NullifierSet` surviving: **0 hits**. Client-lib's `Note` class is a client-side note object, not an on-chain account | ABSENT |
| 12 | Ungated shielded-wallet (verify = Ok(()), §1.7) | Crate moved outside the workspace to repo-root `archive/shielded-wallet/` with DO-NOT-DEPLOY.md; workspace members = `["programs/dark-protocol"]` only; no `shielded` reference in the workspace Cargo.toml or Anchor.toml; it is not compiled by `cargo check` (W1 gate) | ABSENT / QUARANTINED |
| 13 | Fund movement without the gate order (root → solvency → verify → marker → pay) | Exactly two `system_program::transfer` sites in the program: deposit (line ~153, pulls from the signing depositor *before* inserting the bound leaf) and withdraw (line ~276, after root-ring check, solvency check, Groth16 verify, and marker `init`). `transfer` always errors `TransferNotEnabled` | ABSENT |
| 14 | Committed secret key material (original audit Track 4) | `hardening/secret-scan.py` (transplanted into the merged tree) over the whole merged tree: **0 failures** ("clean: no secret key material detected"). 2 REVIEW warnings are 32-byte arrays inside public Jupiter IDL JSONs in the vendored `core/` tree — public interface data, classified review-only by the scanner itself | CLEAN |

**Untouched-surface proof (transplant must not break the kept layers):**
`diff -rq` vs the pristine zolana clone — `rail-worker/` identical;
SDK `intent.ts`, `private-payment.ts`, `rail-authorization.ts`,
`helius-dev-tools.ts`, `utils.ts` identical; wallet `private-payment.ts`,
`rail-authorization.ts`, `rail-worker-client.ts`, `shielded-ledger.ts`
identical. Build verification of the changed surfaces: SDK
`npm run build` clean + `npm test` 7/7; the wallet's migrated
`src/sdk/dark-protocol.ts` typechecks clean against the installed
dependency tree (see TRANSPLANT-NOTES.md and the SDK migration note).

**Disclosed residuals (not absences — known, documented, in scope of
their own work orders):** dev-ceremony VK (W8-C), transfer stub
(W8-B), client-lib `createSpendProof` transfer-shaped input builder
(REAUDIT NEW-2, closes in W8-B), wallet intent layer's FNV *memo
fingerprint* (an intent-payload field hash, self-consistent, never a
commitment/nullifier — commitments there are client-lib Poseidon since
W6), and the placeholder program ID everywhere standing for the W5
fresh ID.

Signed off as part of the transplant build, 2026-11-17. This checklist
is evidence for the merge PR; it is not an audit of the merged program —
the re-audit obligation (TRANSPLANT-SPEC §5.3) still stands before any
"audited" language is used.
