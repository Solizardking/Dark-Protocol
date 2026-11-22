# Dark Protocol MPC Ceremony Runbook — Phase 2 (Groth16, withdraw circuit)

*Ported 2026-11-18 (prep step P0) from the donor tree's kit
(`dark-defi-rewrite/zk/ceremony/`, built and rehearsed there 2026-11-17) and
adapted to this tree: merged paths, merged acceptance-gate counts, and the
APPROVED phase-1 decision (see `docs/CEREMONY-DECISION-BRIEF.md`, approved by
the dev 2026-11-18). The ported kit was re-rehearsed end-to-end in this tree
before any production use — see "Rehearsal evidence" at the bottom.*

This runbook governs the multi-party phase-2 trusted-setup ceremony for the
Dark Protocol withdraw circuit (BN254, Groth16, 13,162 constraints, 4 public
inputs). It is the procedure the scripts in this directory implement:

| Script | Role |
|---|---|
| `contribute.sh` | One contributor adds their entropy to the chain |
| `verify-transcript.sh` | Anyone independently verifies the whole chain |
| `finalize.sh` | Beacon + final verify + VK export + byte-compare report |
| `export_vk.js` | Convert an arbitrary VK export to groth16-solana bytes (never touches the tree's canonical copies) |

The keys currently in the tree (`zk/withdraw.zkey`,
`programs/dark-protocol/src/vk.rs`) come from a **local single-contributor
DEV ceremony**. They are fine for development and devnet rehearsal. They are
**not** production keys. A real ceremony following this runbook is the
production gate.

---

## PHASE 1 — SETTLED (approved decision, 2026-11-18)

**Phase 2 cannot repair a compromised phase 1.** This ceremony is only the
circuit-specific second phase; it builds on a Powers-of-Tau (ptau) file from
phase 1. If phase 1's toxic waste survived anywhere, no number of honest
phase-2 contributors makes the final keys safe.

The production phase-1 decision is **made and approved** (dev, 2026-11-18;
`docs/CEREMONY-DECISION-BRIEF.md`):

- **Production phase 1 = the Hermez perpetual Powers of Tau file
  `powersOfTau28_hez_final_15.ptau`** — Perpetual Powers of Tau contributions
  **1–54 plus a public randomness beacon**, prepared at power **2^15**
  (32,768 max constraints; the withdraw circuit uses 13,162, and 2^15 also
  covers the planned W8 transfer circuit — 2^14 was rejected as too tight).
- **Pinned BLAKE2b-512** (as published in the snarkjs README):
  `982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e`
- **In-tree location:** `zk/keys/pot_hermez15.ptau`. The scripts in this
  directory default to this path. **Never overwrite or substitute the tree's
  dev ptau** (`zk/keys/pot_final.ptau`, local single-contributor, 2^14) — it
  remains the rehearsal/dev file only.
- The alternative (redo phase 1 as our own multi-party ceremony) was
  considered and **not** chosen; the brief records why. Do not re-open it
  mid-ceremony: phase 2 binds to the phase-1 file, and switching ptau after
  phase 2 starts means a new phase 2, a new VK, and a new rehearsal.

### Importing the Hermez ptau (standing procedure)

The file's identity is its **BLAKE2b-512 hash**, not its download source.
Procedure (any machine; the Mac is the expected import machine because this
VM's egress proxy refuses the Hermez S3 bucket):

1. Download `powersOfTau28_hez_final_15.ptau` from **two independent
   mirrors**:
   - `https://circom.info/powersOfTau28_hez_final_15.ptau` (the mirror
     linked from the snarkjs README)
   - `https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau`
2. Compute BLAKE2b-512 of each download (`b2sum`, or python
   `hashlib.blake2b(digest_size=64)`). **Both must equal the pinned hash
   above.** A mismatch = quarantine the file, never use it, and report.
3. Run `snarkjs powersoftau verify <file>` (this tree's
   `zk/node_modules/snarkjs/cli.js`): it must print the 54-contribution
   transcript and end in **"Powers Of Tau file OK!"**.
4. Place the verified file at `zk/keys/pot_hermez15.ptau`, record its
   sha256 in the ceremony transcript header, and note the import in the
   README open-items register.

**Import record (P0, 2026-11-18, from the build VM):** the circom.info
mirror download **succeeded** from this VM (37,831,832 bytes) and its
BLAKE2b-512 **matched the pinned hash exactly**; file sha256
`3ef2ecc5b75d687048cf2d59195119b42fb07c5af639c5f283d84bfa69829e7f`. The
Hermez S3 mirror was also attempted from this VM and returned **403**
(HEAD and GET), consistent with the known egress-proxy behaviour — the
pinned-hash match is the verification that counts. Step 3's
`powersoftau verify` was attempted from this VM in the same P0 session
and was **killed (SIGTERM) after ~50 minutes of CPU with no output and
no verdict** — a VM/time limit, not a failure of the file. It remains
outstanding: run it to completion on a normal machine (the Mac-side
procedure above includes it as step 3) or in a longer VM window, and
record the result in the transcript header before Day 1. The Mac-side
two-mirror procedure above remains the standing fallback for any future
re-import.

Running the phase-2 ceremony on top of the tree's **local** ptau is a
**rehearsal**, however many contributors take part. Label it as such.

---

## Roles

- **Coordinator** — logistics only: prepares the starting zkey, collects
  and forwards each hop's output, maintains the published transcript,
  runs the beacon step at the end. The coordinator's machine and entropy
  are **not** trusted by the security model, and the coordinator **does
  not contribute** (approved package, 2026-11-18) — a ceremony the
  coordinator ran alone would be a single-contributor setup with extra
  steps, and clean separation beats one more hop.
- **Contributors** (**target: 5, minimum acceptable: 3**, from at least 3
  independent organisations/households) — independent people on their own
  (ideally fresh or air-gapped) machines. Slots: **C1 = "8bit"** (the dev,
  on his own machine; contributor labels are public handles — no legal
  names are used anywhere in this ceremony), C2 = independent developer,
  C3 = external security researcher/auditor, C4 = second independent
  developer, C5 = optional public community contributor. Each adds secret
  entropy exactly once, in sequence, then destroys it.
- **Beacon source** — **drand mainnet**: a round number pre-announced
  **before contributions open**, whose output lands after contributions
  close (see step 5). Not a person; a public value nobody can predict or
  grind at announcement time.
- **Verifiers** — at least **two** people who did **not** contribute run
  the full transcript verification and say so publicly. The ceremony is
  only as credible as the independent verifications of its transcript.
- **VK handoff operator** — after finalization, splices the new VK into
  the program and runs the acceptance gate (step 7). May be the
  coordinator, but the splice is a separate, deliberate act — never part
  of `finalize.sh`.

## Security model

Groth16's setup produces "toxic waste" — secret values that, if fully
reconstructed, would let their holder forge proofs. The MPC structure
destroys it jointly:

- **One honest contributor is enough.** Each contribution re-randomizes
  the key with that contributor's secret entropy. If **at least one**
  contributor generated their entropy honestly and **destroyed it**, the
  toxic waste is unrecoverable — even if every other contributor colluded
  and published their entropy.
- **Entropy destruction is the whole game.** An entropy that is written
  down, backed up, screenshotted, or reused contributes nothing. If *all*
  contributors' entropies leak, the keys are compromised, full stop.
- **Publish-and-compare.** Every hop produces a *contribution hash* and a
  zkey sha256. These are published in the transcript as the hop happens.
  A contribution hash is a commitment: it cannot be recomputed or checked
  by an outsider without the zkey, but once published it fixes the hop —
  the final transcript verification (step 4) proves each zkey in the
  chain contains exactly the published contributions, in order, with the
  published hashes. Any mismatch invalidates the ceremony.
- **Hashes are not reproducible from the entropy string.** Rehearsal
  observation: snarkjs mixes fresh system randomness into every
  contribution, so re-running `zkey contribute` with the *same* entropy
  string yields a *different* contribution hash. The published hash —
  not the entropy — is the hop's identity. (This also means a contributor
  cannot "prove" their entropy after the fact, and nobody should ask
  them to.)
- **The chain is hash-linked.** Each zkey embeds the full list of prior
  contributions. Verification checks every hop extends the previous hop
  by **exactly one** contribution with all earlier entries byte-identical,
  so history cannot be rewritten, reordered, or silently dropped.

## Procedure

### Step 0 — Before anyone contributes

1. Confirm phase 1 per the settled decision above: `zk/keys/pot_hermez15.ptau`
   present, its BLAKE2b-512 equal to the pinned hash, `powersoftau verify`
   on record. Record the ptau's sha256 in the transcript header
   (`ceremony/TRANSCRIPT.template.md`). If you are using the tree's local
   ptau, write "REHEARSAL — local ptau" in the transcript header instead.
2. Freeze the circuit. The r1cs (`zk/build/withdraw.r1cs`, sha256
   `a446c630044aa7ea5472762e15824d80ef9ba52238a189b6b27149f61d75cab4`)
   must be the build of the exact circuit that will ship. Any circuit
   change after the ceremony starts invalidates everything — the ceremony
   binds to the r1cs (its hash is embedded in every zkey).
3. **Pre-announce the beacon**: publish, before the first contribution,
   the exact **drand mainnet round** that will finalize the ceremony —
   a round comfortably in the future, whose output lands after
   contributions close — and the iteration exponent (2^10). Anyone must
   be able to check afterwards that the beacon applied was the beacon
   announced.
4. Create the chain directory (outside the repo tree; a ceremony produces
   large append-only artifacts). Produce the starting zkey from the
   Hermez ptau:

   ```
   snarkjs groth16 setup zk/build/withdraw.r1cs zk/keys/pot_hermez15.ptau chain/withdraw_0000.zkey
   ```

   `withdraw_0000.zkey` has 0 contributions. Name every hop with
   zero-padded sequence numbers so lexical sort = ceremony order.
5. Hand each contributor the contributor packet
   (`ceremony/CONTRIBUTOR-PACKET.md`) with their incoming zkey.

### Step 1 — Each contribution (repeat per contributor, in sequence)

The contributor works on their own machine (full detail:
`ceremony/CONTRIBUTOR-PACKET.md`):

1. Receive the current head zkey (`withdraw_NNNN.zkey`). **Verify before
   trusting it**: check its sha256 against the published transcript, and
   verify it against the r1cs and ptau:

   ```
   snarkjs zkey verify zk/build/withdraw.r1cs zk/keys/pot_hermez15.ptau withdraw_NNNN.zkey   # must print "ZKey Ok!"
   ```

2. Contribute. Entropy is prompted with echo disabled and is never
   written to a file or log by the script:

   ```
   zk/ceremony/contribute.sh withdraw_NNNN.zkey withdraw_NNNN+1.zkey "<your public name>"
   ```

   Use a long, unguessable secret that exists nowhere else (diceware,
   hardware random, ≥ ~30 characters). **Never** set `CEREMONY_ENTROPY`
   outside a rehearsal — the script accepts it for test runs only and
   prints a loud warning when it is used; env vars leak via shell
   history, `/proc`, and crash dumps.
3. Publish immediately, in the transcript: your name, the **contribution
   hash**, and the output zkey's **sha256** (the script prints all three).
4. Pass the output zkey to the next contributor (or back to the
   coordinator for forwarding).
5. **Destroy your entropy.** Clear terminal scrollback; confirm it exists
   in no note, file, password manager, or shell history. Its destruction
   is your contribution to the security model — there is no step after
   this that can substitute for it.

The scripts refuse to overwrite an existing output file: the chain is
append-only, and clobbering a hop destroys the transcript.

### Step 2 — Per-hop verification

After every hop, the coordinator (and ideally an independent verifier)
confirms the new head verifies — `ZKey Ok!` — before the next contributor
starts. `verify-transcript.sh` (step 4) re-checks all hops anyway, but
catching a bad hop immediately saves the next contributor's effort.

### Step 3 — Close contributions

When the last contributor is done, announce contributions closed. No
further contributions may be added after the beacon step is scheduled —
the beacon is the final contribution, and anything after it is a
different ceremony.

### Step 4 — Verify the full transcript

Anyone can run this; at least two people other than the contributors
should:

```
zk/ceremony/verify-transcript.sh <chain-dir> zk/build/withdraw.r1cs zk/keys/pot_hermez15.ptau
```

(The script's defaults are exactly this r1cs + the Hermez ptau.) It
verifies **every** zkey in the chain (`ZKey Ok!` at each hop), checks
each hop added exactly one contribution with all previous contributions
byte-identical, and prints the full transcript. Compare the printed
contribution hashes, in order, against the hashes published at each hop.
**Any mismatch invalidates the ceremony** (see "Invalidation & abort").

### Step 5 — Beacon + finalize

Wait for the pre-announced drand round output to exist, then:

```
zk/ceremony/finalize.sh <chain-dir>/withdraw_LAST.zkey <drand-round-output-hex> 10 <out-dir> zk/build/withdraw.r1cs zk/keys/pot_hermez15.ptau
```

`finalize.sh`:

1. applies the beacon (`zkey beacon`, 2^10 iterations),
2. verifies the final zkey — requires **`ZKey Ok!`**,
3. exports the verification key and converts it to the groth16-solana
   byte format (`vk_solana.bin`, 768 bytes) via `ceremony/export_vk.js`,
4. byte-compares the new VK against the bytes currently spliced into
   `programs/dark-protocol/src/vk.rs` and **reports** the result.

It never splices anything and never writes into the tree's artifact
slots. After a real ceremony the compare **must report DIFFERS** — new
contributions change the keys. A MATCH means the ceremony reproduced the
old key: a red flag, not a success (a MATCH is expected only when
finalizing the tree's current dev key as a pipeline check).

### Step 6 — Publish

Publish the complete transcript: ptau provenance + BLAKE2b + sha256,
r1cs/circuit hash, every contribution hash in order with contributor
names and zkey sha256s, the drand round + output + exponent, the final
zkey sha256, and the final `vk_solana.bin` sha256. The ceremony's claim
to trust is exactly this transcript plus independent re-verifications of
it.

### Step 7 — VK handoff (the splice; separate and test-gated)

Only after steps 4–6:

1. In a working copy of the tree, feed the ceremony's
   `verification_key.json` through the tree's own generators —
   `zk/scripts/export_vk.js` then `zk/scripts/generate_vk_rs.js` — to
   produce the generated `vk_dropin.rs`. The drop-in is **generated,
   never hand-typed**.
2. Splice the generated constants into
   `programs/dark-protocol/src/vk.rs`; stage the final zkey as
   `zk/withdraw.zkey` (and `zk/withdraw.vkey.json` /
   `zk/verification_key.json` alongside it; the wasm does not change —
   it depends on the circuit, not the ceremony).
3. **Acceptance gate — all suites green on the spliced tree:**
   - zk e2e: `node test_withdraw.js` — **13/13**
   - program: `cargo test --lib` — **20/20**
   - client-lib: `npm test` — **34/34**

   Any red suite means the splice is wrong; revert it and diagnose. The
   new keys are not "production" until this gate passes on the exact
   tree that will be deployed.
4. **Devnet re-rehearsal with the production VK** (separately gated):
   upgrade the devnet program with the spliced VK and repeat deposit →
   withdraw → replay-reject before any mainnet conversation. A production
   VK that has never run on devnet does not go to mainnet.

## Invalidation & abort

The ceremony is **invalid** — do not finalize, do not splice — if any of
the following holds:

- any hop fails `zkey verify` (no `ZKey Ok!`),
- a hop adds other than exactly one contribution, or any earlier
  contribution's name/hash differs between hops (history rewritten),
- a published contribution hash or zkey sha256 does not match the chain,
- the beacon applied is not the pre-announced drand round output, or was
  applied before contributions closed,
- the ptau or r1cs used differs from the ones recorded at step 0,
- a contributor's entropy is discovered to have been recorded or leaked
  *and* the remaining honest contributions are too few to meet the
  ceremony's stated threshold (if every entropy leaks, the keys are
  compromised regardless of the transcript's validity).

**Abort procedure:**

1. Stop the chain. Announce the abort and the reason in the same place
   the transcript is published; mark the transcript INVALID — never
   delete it (a deleted transcript looks identical to a hidden one).
2. Quarantine the chain directory. Its zkeys must never be finalized or
   spliced.
3. Restart from step 0 with a fresh `withdraw_0000.zkey`. Contributions
   are cheap; a questionable ceremony is not worth salvaging hop-by-hop.
   (Exception: if a single hop is corrupt and the transcript up to the
   previous hop verifies cleanly, the coordinator may restart the chain
   from that verified head with a fresh contribution — and must say so
   in the transcript.)
4. If an invalid ceremony's VK was already spliced (it should never be —
   step 7 is gated on step 4), revert
   `programs/dark-protocol/src/vk.rs` and the staged artifacts to the
   previous keys, re-run the acceptance gate, and treat any deployment
   of the bad keys as compromised.

---

## Rehearsal evidence (FAKE contributions — not a real ceremony)

The kit was originally built and rehearsed end-to-end in the donor tree
on 2026-11-17 (transcript, finalize, proof cross-check, tree integrity —
recorded in the donor runbook). **The P0 port was re-rehearsed in THIS
tree on 2026-11-18**, as prep step P0 requires, so the production run is
the kit's second execution here. Everything below is from that merged-tree
rehearsal. All contributions were made with `CEREMONY_ENTROPY` set to
throwaway strings by fake personas, on top of the tree's **local
single-contributor dev ptau** (`zk/keys/pot_final.ptau`). None of it
produces usable keys; it proves the *pipeline* — chaining, verification,
finalization, VK export, and proof generation under the new keys — end
to end in this tree's layout. The tree's artifacts were verified
byte-identical before and after (see "Tree integrity").

Rehearsal workspace: `/p0-rehearsal-scratch/` (`chain/`, `out/`, `logs/`).

### Chain

| Hop | File | Contribution |
|---|---|---|
| seed | `chain/withdraw_0000.zkey` | groth16 setup over this tree's r1cs + local dev ptau (0 contributions) — zkey sha256 `e5d06e8cad5b087be463680b1f32547c5214f417708b1819ada7082c8794fdc0` |
| 1 | `chain/withdraw_0001.zkey` | #1 `REHEARSAL contributor A (FAKE)` — hash `1b4225c1c539bef90c2026bc78510a5fdbb18cc04fa9e58d4ff6b2eefc2d4effbd2a3d46ef553464891f1580006c2e8a627a598327318bd638c57e55aedd03fb`; zkey sha256 `44345c181958b0ef0b03ea30b2e47556621c28b08e509411429b140803ef3b96` |
| 2 | `chain/withdraw_0002.zkey` | #2 `REHEARSAL contributor B (FAKE)` — hash `867836ab7df2c144dce51bd1056ca2e28adadf6f98146b2ad9a4c4e70b3f6acdf5993df15af78a1195d442aa45d62ad0a446fdeb1afcd17be2592ab23e2cd92e`; zkey sha256 `eec8fb5c3562d0c1a35837044b1773a95b0a7455e2e55b79619ad5a1ed755c3e` |

Pre-beacon transcript verification (`logs/verify_transcript.log`):

```
RESULT: TRANSCRIPT OK — 3 zkeys, 2 contributions,
every hop verified (ZKey Ok!), hash chain intact, +1 contribution/hop.
```

### Finalize run

```
finalize.sh chain/withdraw_0002.zkey \
  7a2d2af5ed81a82b8a2a17da224fe5832bbd4a9d9ad96ba826b0dbe2768bb574 10 out \
  zk/build/withdraw.r1cs zk/keys/pot_final.ptau
```

The beacon hash is a **FAKE** — `sha256("p0-rehearsal-fake-beacon-2026-11-18")`,
a locally generated placeholder, not pre-announced public randomness.
Output (log: `logs/finalize.log`):

- Beacon applied; contribution #3 (beacon) hash:
  `0d27d8d661cb4ba6defe615f5b73c2cb9e42f7054211dcc47df656f3aa523c9a2cc2c939277bf7f4597e492af67766cb5aa8a7255f4059183292e754c395f4fc`
  (iterations exp 10)
- Final zkey: `/p0-rehearsal-scratch/out/withdraw_final.zkey`,
  sha256 `6029919e8b4d3644c4046c7d9ec8eb9b74e45c4f4fb64d7dc4898ffff6d3cafd`
- Final verify: **`ZKey Ok!`**
- Rehearsal VK exported: `out/vk_solana.bin` (768 bytes, 4 public inputs,
  5 IC points), sha256 `3689c1b0f1351b767df2c5183d502219229c60c988ea5ad63cf0bb752734acbc`
- Byte-compare vs `programs/dark-protocol/src/vk.rs`: **DIFFERS**
  (required — the rehearsal contributions changed the keys; also DIFFERS
  vs `zk/vk_solana.bin`). Nothing was spliced.

Full-chain transcript re-verified including the beacon hop
(`logs/verify_transcript_full.log`):

```
RESULT: TRANSCRIPT OK — 4 zkeys, 3 contributions,
every hop verified (ZKey Ok!), hash chain intact, +1 contribution/hop.
```

### Proof test under the finalized rehearsal keys

`/p0-rehearsal-scratch/proof_test.js` (follows `zk/test_withdraw.js`
patterns; tree wasm used read-only, proving key and VK from the rehearsal
output). One honest note (value 1000, leaf index 2, root
`9765408417994353341755598876392066457879491545047313893046628331096016745833`,
nf `4639900115014784909356929643237572855794792547067418598463926099733475109929`):

```
verify vs REHEARSAL VK (finalized ceremony keys): true
verify vs TREE VK (current dev keys):              false
RESULT: PASS — proof verifies under the rehearsal keys and is rejected under the tree keys.
```

The cross-check matters: the proof verifying under the new VK and
*failing* under the tree's current VK is the direct evidence that the
ceremony produced genuinely different keys, and that the
prover→verifier path works with them.

### Tree integrity

Baseline recorded before the rehearsal in
`/p0-rehearsal-scratch/tree_hashes_before.txt`; re-checked after all
rehearsal work (`sha256sum -c`, run from `dark-protocol/`):

```
zk/withdraw.zkey: OK
zk/withdraw.wasm: OK
zk/verification_key.json: OK
zk/withdraw.vkey.json: OK
zk/vk_solana.bin: OK
zk/keys/withdraw_dev.zkey: OK
zk/keys/verification_key.json: OK
zk/keys/vk_solana.bin: OK
zk/keys/pot_final.ptau: OK
zk/build/withdraw.r1cs: OK
programs/dark-protocol/src/vk.rs: OK
```

All 11 protected files byte-identical. The only files this rehearsal
added to the tree are the ceremony kit and materials in `zk/ceremony/`
(and, from the separate P0 import step, `zk/keys/pot_hermez15.ptau`).
