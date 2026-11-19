# Findings Map — audit finding → fix → proving test

Audit: `~/workspace/dark-defi-audit/AUDIT.md` (2026-11-16). Scope here is the
TypeScript client crypto (Scope B of the audit). Program-track findings
(C-1, H-2, H-3, H-4, M-1…M-7, L-*, I-1…I-4, Finding #0) are other tracks'
work and are not addressed by this package.

| Finding | What was wrong | Fix in this rewrite | Proving test |
|---|---|---|---|
| **C-2** (ZK placeholders; verifier = length check) | `generateZKProof` returned 256 random bytes; `verifyZKProof` was `proof.length === 256` | `src/proofs.js`: real Groth16 via snarkjs against the ZK track's artifacts; if `withdraw.wasm`/`withdraw.zkey` are absent, `createSpendProof` throws `ArtifactMissingError`. No placeholder, no length-check verifier, no fallback. | `proofs.test.js`: "missing ZK artifacts → ArtifactMissingError, never a fabricated proof"; "spend inputs are built from real Poseidon crypto" |
| **C-3** (no ZIP-32; keys = Blake3(seed‖label)) | One-shot labeled hashes; no chain codes, no child derivation | `src/keys.js`: ZIP-32 construction shape — master from seed under personalization, (sk, chain-code) split, hardened-only child derivation, PRF^expand-style labeled subkeys — instantiated with BLAKE2b-512 under our own domain `"DarkZIP32"` | `keys.test.js`: determinism; domain separation; per-index child separation |
| **C-4** (pk_d is a hash, not a curve point) | No group structure → no key agreement possible | Addresses carry a real X25519 public key derived per index (`deriveAddressFromViewingKey`); owner identity is `Poseidon(sk, 1)` per the shared contract. (BN254/Poseidon design replaces the Jubjub construction rather than imitating it — see README "What this is NOT".) | `keys.test.js`: address key is a genuine X25519 keypair (`x25519.getPublicKey(secret) === addr.encPk`) |
| **C-5** (note "ECDH" = two unrelated hashes; decryption impossible) | Sender hashed (esk‖pk_d), receiver hashed (ivk‖epk) — different inputs, no relation | `src/encryption.js`: real X25519 — sender `DH(eph_sk, recip_pk)`, receiver `DH(recip_sk, eph_pk)`, equal by group law; HKDF-SHA256 → ChaCha20-Poly1305 | `encryption.test.js`: round-trip; wrong-key failure; wrong-index failure |
| **C-6** (nullifier random/zeros, unbound) | `generateNullifier()` returned CSPRNG bytes; one path submitted all-zero nullifiers | `nf = Poseidon(nk, leaf_index)` with `nk = Poseidon(sk, 0)` (shared contract) — deterministic, key-bound, leaf-bound | `notes.test.js`: "nullifier is deterministic per (key, leaf) and unique per leaf" |
| **H-5** (nonce/format breaks decryption; truncation into fixed arrays) | Random nonce prepended ad hoc → 592B ciphertexts the decryptor rejected (≠580); on-chain copies truncated | Fixed versioned wire format (version ‖ eph_pk ‖ nonce ‖ ct+tag), one parser, no fixed-size truncation anywhere; total size is a tested constant | `encryption.test.js`: "wire format parses back into its documented components"; round-trip |
| **H-6** (ephemeral key deterministic from rseed; fabricated h_sig) | `esk = blake3(rseed‖label)` — learning rseed exposed every note | Fresh CSPRNG ephemeral X25519 keypair per note, independent of all note fields; no h_sig concept exists (binding to the spend is the circuit's job, via the proof) | `encryption.test.js`: "ephemeral key is fresh per note — same note encrypts differently twice" |
| **H-7** (commitments bind nothing; cv from ASCII digits) | `cm`/`cv` were Blake3 hashes with raw rseed embedded | `cm = Poseidon(owner_id, value, blinding)`, uniform random field-element blinding — the exact object the circuit opens; tampering with value or blinding changes cm | `notes.test.js`: "commitment opens correctly and binds the value"; "commitment is hiding" |
| **H-8** (multisig approval = pubkey string) | `approve(id, pubkeyString)` checked list membership only | `src/multisig.js`: approval = Ed25519 signature over `SHA-256(domain ‖ proposalId ‖ action ‖ H(payload))`, verified per distinct owner against threshold | `multisig.test.js`: forged-approval test (pubkey + garbage signature counts 0), wrong-payload, replay-across-proposals, non-owner, duplicate-counts-once |
| **M-8** (view-only wallet derives different addresses) | View path and spend path used different hash inputs for the same index | One function, `deriveAddressFromViewingKey(fvk, index)`, used by both; the FVK carries ownerId + encViewingSecret so a view-only wallet reproduces spending-wallet addresses exactly | `keys.test.js`: "view-only wallet derives the SAME addresses as the spending wallet" (indices 0,1,2,5, byte-equal) |
| **M-9** (forgeable hash "payment proof"; keyless verify returns true) | `sha256(fields‖ovk)`; verifier accepted on structural checks alone | `src/proofs.js`: receipt = Ed25519 signature by the payer's dedicated receipt key over `H(domain ‖ cm ‖ nf ‖ amount ‖ recipient)`; verification requires the expected payer pubkey — no keyless path | `proofs.test.js`: "payment receipt: payer signature verifies, forgery does not" (tampered amount, wrong payer, null key, attacker-key forgery, garbage signature) |
| **M-11** (toy SHA-256 list tree) | Pairwise SHA-256 with duplication, depth unused, incompatible witnesses | `src/merkle.js`: depth-20 Poseidon tree, zero-hash subtrees, circuit-shaped paths (`pathElements`/`pathIndices`) | `notes.test.js`: "Merkle path verifies against the root at depth 20"; empty-root test |
| **M-12** (secp256k1 BIP32 key reused as Ed25519 seed) | Same secret across curves/schemes; nonstandard restoration | No secp256k1, no BIP32 anywhere. Three independent labeled derivation domains: BN254 spending (0x00), X25519 encryption (0x02), Ed25519 receipt signing (0x03) — plus OVK-analog (0x01). No secret is an input to two schemes. | `keys.test.js`: "no key reuse across curves" (all secrets pairwise distinct, each a valid keypair in its own scheme only) |
| **I-5** (false "production-faithful"/Sapling-compat claims) | Headers claimed Rust counterparts and Sapling compatibility that didn't exist | README + module headers state plainly: Sapling-ARCHITECTURE, `"DarkZIP32"` domain, 64-byte addresses, NOT interoperable, unaudited, dev keys only | Documentation (this file + README); no test can prove a doc claim — the re-audit checks it |

## Deliberate divergences from the old design (not findings, design choices)

- **Value in the clear inside the note plaintext only.** Amounts are hidden
  by the commitment + proof, as in Sapling; the old code additionally leaked
  plaintext amounts into program instruction args (M-10) — that was program/
  wallet-layer behavior, out of this package's scope, flagged for the wallet
  track.
- **No memo field** in note plaintext v1 (80-byte fixed layout, documented in
  `encryption.js`). Sapling separates memo into a second ciphertext box; a
  format v2 can do the same without touching the DH construction.
- **Change notes** are first-class in the spend inputs (`changeCm`), where
  the old wallet stored the recipient's note as the sender's own (M-10,
  wallet layer — the client crypto here makes the correct objects available).
