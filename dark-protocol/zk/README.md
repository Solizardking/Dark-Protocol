# Dark DeFi — ZK core (Track 1)

Real Groth16 proofs for the Dark DeFi rewrite. This replaces the old
Dark-Defi-1 placeholder cryptography, where `verifyZKProof` was
`return proof.length === 256` and "proofs" were random bytes
(audit finding C-2). Everything here actually proves and verifies:
the end-to-end test generates a real proof and rejects every tampered
variant (see "Test" below).

## ⚠️ DEV KEYS — NOT PRODUCTION KEYS

The proving/verification keys in this directory come from a **local,
single-contributor** Groth16 setup run on one VM (phase 1 Powers of Tau
with one contribution + circuit-specific phase 2 with one contribution).
Whoever ran that setup could in principle have kept the toxic waste and
could forge proofs. **Production requires a multi-party computation (MPC)
ceremony** (e.g. the Hermez perpetual Powers of Tau for phase 1 plus a
multi-contributor phase 2) and fresh keys generated from these circuits
in that ceremony. Treat every artifact here as development-only.

## Design contract (as implemented)

- Curve/field: **BN254** scalar field. Hash: **Poseidon** (circomlib,
  both in-circuit and in JS via circomlibjs — the test proves they agree).
- Keys: `sk` = spending key (field element).
  `nk = Poseidon(sk, 0)` (nullifier key), `owner_id = Poseidon(sk, 1)`.
- Note: `{ owner_id, value (u64), blinding }`.
  Commitment `cm = Poseidon(owner_id, value, blinding)`.
- Tree leaf: `leaf = Poseidon(cm, amount)` — the deposit-bound leaf. The
  on-chain program computes it at deposit from the lamports pulled; the
  circuit recomputes it from the note opening and proves membership of the
  bound leaf. (Added 2026-11-17 as the fix for re-audit NEW-1: previously
  raw `cm` was the leaf, so a commitment's internal value was never bound
  to the amount actually deposited.)
- Nullifier: `nf = Poseidon(nk, leaf_index)`.
- Merkle tree: **depth 20**, 2-input Poseidon nodes.
  - Empty-leaf value is `0`; zero-subtree hashes:
    `zeros[0] = 0`, `zeros[i+1] = Poseidon(zeros[i], zeros[i])`.
  - Path indices are **LSB-first**: `pathIndices[0]` is the lowest bit of
    the leaf index; `pathIndices[i] == 0` means the running node is the
    left child at level `i`.
  - The circuit forces `pathIndices` to equal the bits of `leafIndex`, so
    a path cannot be reinterpreted for a different leaf position.
- **Withdraw circuit** (`circuits/withdraw.circom`, 13,162 constraints).
  Public inputs, **in this order** (Groth16 binds them positionally; the
  on-chain verifier must supply them in this order):
  1. `root` — Merkle root the bound leaf is proven against
  2. `nf` — nullifier of the spent note
  3. `recipient` — payout destination binding, encoded as
     `Poseidon(hi128, lo128)` of the recipient's 32-byte Solana pubkey,
     where `hi128` = bytes 0..15 as a big-endian integer and
     `lo128` = bytes 16..31 as a big-endian integer.
  4. `amount` — payout amount. **V1 semantics: full-note spend.** The
     circuit computes the commitment over `amount` directly, so the
     note's value must equal `amount` (no change note), and `amount` is
     range-checked to u64. It then computes the bound leaf
     `leaf = Poseidon(cm, amount)` and proves the Merkle path for that
     leaf — so the note is spendable only if a deposit of exactly
     `amount` was made against its commitment (NEW-1 fix).
  Private inputs: `sk`, `blinding`, `leafIndex`, `pathElements[20]`,
  `pathIndices[20]`.
  Public inputs `root`/`nf`/`recipient` are additionally squared into the
  constraint system (Tornado-style anti-malleability, preventing a proof
  from being re-bound to a congruent public input `x + p`).
- **Transfer circuit (2-in/2-out): NOT BUILT in this pass.** It was second
  priority behind a fully working, verified withdraw; withdraw now meets
  that bar, so transfer is the next task, not a silent omission.

## Final artifacts (standardized names — INTEGRATIONS.md §5)

At the **zk/ root** (this is where the client track's prover loader,
`client/src/proofs.js`, looks — its `DEFAULT_ZK_DIR` is this directory):

| File | What |
| --- | --- |
| `withdraw.wasm` | circuit wasm for snarkjs `groth16.fullProve` |
| `withdraw.zkey` | proving key (DEV ceremony) |
| `verification_key.json` | verification key, snarkjs JSON |
| `withdraw.vkey.json` | byte-identical alias of the VK JSON (client loader naming pattern) |
| `vk_solana.json` | VK in groth16-solana byte format (per-point hex) |
| `vk_solana.bin` | VK as one 768-byte blob (layout in `scripts/convert.js`) |
| `vk_dropin.rs` | the VK as Rust constants, ready to paste into the program |
| `proofs/sample_proof.json` | a real proof for the test note (snarkjs JSON) |
| `proofs/sample_proof.bin` | the same proof as 256 raw bytes: `a(64) ‖ b(128) ‖ c(64)` |
| `proofs/sample_public.json` / `.bin` | its public inputs `[root, nf, recipient, amount]` (JSON / 4×32-byte BE) |

## VK handoff to the program track (DONE — twice)

The real VK is spliced into `program/src/vk.rs`: the five constants
(`VK_ALPHA_G1`, `VK_BETA_G2`, `VK_GAMMA_G2`, `VK_DELTA_G2`, `VK_IC`) came
from the generated `vk_dropin.rs` (never hand-typed), the spliced
constants were verified **byte-identical** to `vk_solana.bin` (768/768
bytes), and `VK_IS_PLACEHOLDER` is `false`. This was done once for the
original circuit and again on 2026-11-17 after the NEW-1 circuit change
and its fresh phase-2 ceremony. To redo it after any future ceremony:
regenerate `vk_dropin.rs` (`scripts/generate_vk_rs.js`), replace the five
constants with the drop-in arrays (same layout: big-endian limbs; G2
limbs ordered `c1‖c0` per 64-byte half, the groth16-solana / alt_bn128
precompile format), keep `VK_IS_PLACEHOLDER = false`, and re-run the
byte-identity check against `vk_solana.bin`. Nothing else changes:
public-input order `[root, nf, recipient, amount]`,
`NR_PUBLIC_INPUTS = 4`, `VK_IC` has 5 points.

Format cross-check: in any Groth16 VK, `gamma` is the BN254 G2
generator; the converted `vk_gamma_g2` bytes are **byte-for-byte
identical** to the BN254 G2 generator constant in `vk.rs`, which the
program track's own Rust test proves equals the arkworks serialization
of the generator in this format. So the byte ordering in
`scripts/convert.js` matches the program's expectation exactly.

Raw forms: `vk_solana.json` (hex per point) and `vk_solana.bin`
(768 bytes = `alpha(64) ‖ beta(128) ‖ gamma(128) ‖ delta(128) ‖
ic[0..4](64 each)`).

## File layout

```
zk/
  withdraw.wasm  withdraw.zkey  verification_key.json  withdraw.vkey.json
  vk_solana.json  vk_solana.bin  vk_dropin.rs        <- final artifacts (root)
  circuits/
    withdraw.circom     the withdraw circuit (main {public [root, nf, recipient, amount]})
    merkle.circom       MerkleInclusion(levels) — Poseidon binary tree
  scripts/
    darknote.js         JS side of the contract: key/note/nf derivation,
                        boundLeaf(cm, amount), PoseidonTree (insert of the
                        bound leaf + path), recipient encoding
    convert.js          snarkjs JSON <-> groth16-solana byte encodings
    export_vk.js        verification_key.json -> vk_solana.{json,bin} (keys/ + root)
    generate_vk_rs.js   verification_key.json -> vk_dropin.rs
    setup.sh            compile + local DEV ceremony + exports + artifact staging
  keys/                 ceremony material (DEV): pot_0000.ptau, pot_0001.ptau,
                        pot_final.ptau, withdraw_dev.zkey, verification_key.json,
                        vk_solana.{json,bin}, ceremony_redo.sh (the exact redo script)
  build/                circom outputs (withdraw.r1cs, withdraw_js/withdraw.wasm, .sym)
  proofs/               sample proof + public inputs (JSON + raw bytes)
  test_withdraw.js      the end-to-end test
```

Toolchain: circom **2.2.3** release binary at `../tools/circom`;
snarkjs 0.7.x + circomlib + circomlibjs in `node_modules/` (local to zk/).

## Test

```
node test_withdraw.js
```

Builds a depth-20 Poseidon tree in JS over deposit-bound leaves, inserts
several notes, generates a **real** Groth16 proof for a note at leaf 2,
and verifies it off-chain. Last run (2026-11-17, post-NEW-1):
**13/13 checks passed**:

- public signals are `[root, nf, recipient, amount]` in contract order
- honest proof verifies
- tampered amount (+1) is REJECTED
- tampered recipient is REJECTED
- tampered root is REJECTED
- tampered nullifier (wrong leaf index) is REJECTED
- tampered nullifier (garbage / replay substitute) is REJECTED
- tampered proof (pi_a + 1) is REJECTED
- proof for a second note at leaf 4 verifies
- **NEW-1 drain: a commitment claiming V = 1,000,000 deposited with
  1 lamport FAILS to prove at V** (witness generation hits the
  root-equality constraint — the bound leaf for V is not in the tree)
- **NEW-1 drain: the same note also FAILS at the deposited amount**
  (the commitment does not open at value 1)
- **NEW-1 drain: an honest note in the same attacked pool still
  withdraws its full deposit**
- sample proof exported (JSON + 256 raw bytes)

## Rebuilding / re-running the setup

`scripts/setup.sh` reproduces everything (compile → Powers of Tau 2^14 →
phase 2 → exports → staged root artifacts). On this VM it was actually
executed with the ceremony steps run from `/tmp` (see divergences) and the
artifacts copied back; `keys/ceremony_redo.sh` is the exact script used.

## Divergences & environment notes (loud, per instructions)

1. **Artifact location/names standardized per INTEGRATIONS.md §5:**
   finals live at the **zk/ root** as `withdraw.*`, not only under
   `build/`/`keys/`. The client loader's old `spend.*` names were retired
   in favor of `withdraw.*` (the client track updates its three filename
   constants accordingly; its directory default already points here).
2. **Ceremony provenance:** the first local ceremony attempt's
   `pot_0001.ptau` was silently truncated by this VM's disk-quota
   flapping (4.5 MB instead of 6.29 MB). The keys delivered here come
   from a **redo** ceremony run from `/tmp` (tmpfs, outside the quota'd
   volume): fresh `powersoftau new` → 1 contribution → `powersoftau
   verify` → **"Powers of Tau Ok!"** → `prepare phase2` → `groth16 setup`
   → 1 phase-2 contribution → `zkey verify` → **"ZKey Ok!"** → VK export.
   The truncated first-attempt file was replaced by the verified redo's
   `pot_0001.ptau`.
3. **No public ptau:** the Hermez perpetual Powers of Tau file
   (`powersOfTau28_hez_final_14.ptau`) could not be downloaded from this
   VM (HTTP 403 from both the GCS bucket and the S3 mirror through the
   egress proxy), so phase 1 is a fresh local ceremony, not the Hermez
   multi-party one. Another reason these keys are DEV-only.
4. **Powers of Tau size:** 2^14 (16,384) — 12,645 constraints originally;
   13,162 after the NEW-1 leaf binding (one extra arity-2 Poseidon).
5. **Transfer circuit:** not built (see contract section).
6. The old trees (Dark-Defi-1 etc.) were used read-only; nothing outside
   `~/workspace/dark-defi-rewrite/zk/` (plus `../tools/circom`) was
   modified by this track.
7. **NEW-1 ceremony (2026-11-17):** the circuit changed (bound-leaf
   membership), so phase 2 was re-run via `scripts/setup.sh`: the
   existing verified `keys/pot_final.ptau` was reused (phase 1 is
   circuit-independent), phase 2 is a fresh single contribution, and
   `powersoftau verify` / `zkey verify` both printed Ok again. New
   artifacts were staged at the zk/ root and the program VK re-spliced
   (see the VK handoff section). Still a local single-contributor DEV
   ceremony — the production MPC requirement is unchanged.
