# Dark DeFi Client Crypto (rewrite)

Shielded-note client cryptography for the Dark DeFi stack, rewritten after the
2026-11-16 audit (`~/workspace/dark-defi-audit/AUDIT.md`) found the original
TypeScript client to be a hash-chain mock-up: no real key derivation, note
"encryption" whose two sides computed unrelated hashes (decryption was
mathematically impossible), placeholder ZK, and string-compare multisig.

## What this is

- **Sapling-ARCHITECTURE** shielded notes: ZIP-32-style hardened key
  hierarchy, diversified addresses, note encryption, commitments/nullifiers,
  a Poseidon Merkle tree, Groth16 spend proofs, multisig approvals, signed
  payment receipts.
- All in-circuit values live over **BN254 + Poseidon** (circomlib-compatible
  parameters, via circomlibjs), under the shared design contract:
  `nk = Poseidon(sk, 0)`, `owner_id = Poseidon(sk, 1)`,
  `cm = Poseidon(owner_id, value, blinding)`, `nf = Poseidon(nk, leaf_index)`,
  Merkle depth 20 over deposit-bound leaves `leaf = Poseidon(cm, amount)`
  (the program computes the bound leaf at deposit; see `Note.boundLeaf()`).
- Note encryption is **real X25519 Diffie–Hellman** (@noble/curves) with
  HKDF-SHA256 → ChaCha20-Poly1305 (@noble/ciphers), fresh ephemeral key per
  note, and a fixed versioned wire format that round-trips.
- Multisig approval is a **real Ed25519 signature** over the exact proposal
  digest. Payment receipts are **Ed25519 signatures** over
  `(cm, nf, amount, recipient)`.

## What this is NOT — read before trusting anything here

- **NOT Zcash/Sapling interoperable.** The key hierarchy follows the ZIP-32
  *construction shape* under our own personalization domain `"DarkZIP32"`,
  not `ZcashIP32Sapling`. Keys, addresses (64-byte, not 43-byte), and proofs
  from this code work with nothing in the Zcash ecosystem. Any document or
  comment claiming Sapling compatibility for this code is wrong (that false
  claim was audit finding I-5 in the old code; do not reintroduce it).
- **Re-audited once (2026-11-17, `../REAUDIT.md`).** The re-audit's
  Critical (NEW-1, deposit value binding) is fixed and covered by the
  integration drain test here; the client-side notes it raised (NEW-2/4/5/6
  — the transfer-shaped input builder, multisig digest encoding, the
  `MAX_VALUE` bound, `_accountNode` exposure) are documented in the
  re-audit and remain open. Devnet/demo only.
- **Dev keys only.** Test seeds in this repo are throwaway. Nothing here has
  ever held, or should hold, mainnet funds.
- **ZK artifacts live in this tree.** Proving uses the ZK track's
  `withdraw.wasm` / `withdraw.zkey` from this tree's own `zk/` directory
  (`dark-protocol/zk/`) — that is the client-lib default, resolved
  relative to the package and overridable per call. If they are absent
  the prover throws
  `ArtifactMissingError` — by design; there is no fallback or placeholder
  proof anywhere in this code.
- **Poseidon cross-check DONE.** Client Poseidon (circomlibjs), the
  circuit's Poseidon, and the program's `light-poseidon` are the same
  function, proven three ways: the pinned known-answer vector in
  `test/notes.test.js` (from circomlibjs), the same vector in
  `test/withdraw-integration.test.js` checked against the *program's*
  light-poseidon KAT, and real client-built notes proving in the circuit
  and verifying (the integration test).

## Layout

| File | Contents |
|---|---|
| `src/field.js` | BN254 Fr arithmetic + byte encodings |
| `src/poseidon.js` | Poseidon (circomlibjs) + contract hashes (nk, owner_id, cm, nf, bound leaf) |
| `src/keys.js` | ZIP-32-style derivation ("DarkZIP32"), viewing keys, addresses |
| `src/notes.js` | Note, commitment opening, nullifier, `boundLeaf()` |
| `src/merkle.js` | Depth-20 Poseidon tree over bound leaves + paths |
| `src/encryption.js` | X25519 note encryption, wire format v1 |
| `src/multisig.js` | Ed25519 multisig approvals |
| `src/proofs.js` | snarkjs spend-proof interface + payment receipts |

## Dependencies (pinned by package-lock.json)

`@noble/curves` 1.9.7 · `@noble/ciphers` 1.3.0 · `@noble/hashes` 1.8.0 ·
`circomlibjs` 0.1.7 · `snarkjs` 0.7.6 — nothing else.

## Tests

```
npm test   # node --test, 34 tests
```

Cover: encrypt→decrypt round-trip incl. wrong-key/wrong-index/tamper
failures; spend-vs-view address equality; nullifier determinism and
per-leaf uniqueness; commitment opening and value binding; the bound leaf
`Poseidon(cm, amount)` (NEW-1); multisig accept /
forge / replay / threshold; derivation determinism and domain separation;
Merkle path verification at depth 20; spend-proof input construction and the
missing-artifact hard failure; payment-receipt verification and forgery
rejection; and `test/withdraw-integration.test.js` — client-built notes
proving in the real circuit and verifying, the Poseidon KAT against the
program's light-poseidon vector, and the NEW-1 drain failing end to end.

See `FINDINGS-MAP.md` for the finding-by-finding account of what was fixed
and which test proves it.
