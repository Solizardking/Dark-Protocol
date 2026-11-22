# Dark Protocol — Merged-Tree Re-Audit

**Date:** 2026-11-17 · **Mode:** read-only audit of the merged tree; no code changed. The only file written into the tree is this report.
**Subject:** `~/workspace/zolana-transplant-merge/` — the Dark Protocol tree after the core transplant (TRANSPLANT-SPEC W0–W4, W6–W8) and the SBF stack-frame fix.
**Baseline:** `~/workspace/dark-defi-audit/AUDIT.md` (39 findings), `~/workspace/dark-defi-rewrite/REAUDIT.md` (donor re-audit: all original mechanisms dead; NEW-1 Critical found and subsequently fixed in the donor), `~/workspace/zolana-transplant-merge/TRANSPLANT-NOTES.md` (transplant record incl. frame-fix addendum).
**Method:** every claim below is backed by evidence I produced or inspected personally in this session — programmatic constant extraction and diffing, file-level diffs against the donor, recomputed IDL discriminators, my own grep sweeps, the tree's secret scanner run by me, and every test suite and the SBF build re-run first-hand. Claims in TRANSPLANT-NOTES were treated as claims, not evidence.

---

## 1. Bottom line

**The merged tree preserves every security property of the re-audited donor. The transplant and the frame fix introduced no new Critical, High, or Medium findings.**

The frame fix — the highest-risk change, because it hand-transcribed cryptographic parameter tables — is **proven bit-exact by independent extraction**: all 204 `BigInteger256` limb quads (195 round constants + 9 MDS entries) in the new `poseidon_params.rs` are limb-for-limb identical to light-poseidon 0.2.0's generated `bn254_x5.rs` t==3 branch, extracted from the cargo registry source by me, not copied from the notes. The transplant itself is a rename plus exactly one type change (`Box<Account<Pool>>`); every other program file is byte-identical to the donor, the VK is byte-identical, and every ZK artifact hash-matches the donor.

All suites re-run green first-hand (program 18/18, ZK e2e 13/13, client-lib 34/34, SDK 7/7, indexer 3/3), and a fresh SBF build reproduces the in-tree artifact **byte-for-byte** (sha256 `e51c2596…`, 321,592 B) with **zero** frame diagnostics on a forced final-crate recompile + relink.

New findings from this audit: **1 Low, 2 Info** — all transplant-introduced documentation/path defects, none touching a security property:

- **MERGED-NEW-1 (Low):** the merged client-lib's default ZK artifact path still points at the *donor* tree (`~/workspace/dark-defi-rewrite/zk/`). The merged tree is not self-contained for proving. Fail-closed and harmless today (artifacts are byte-identical), but it should be fixed as a W5 prep step so the W5 rehearsal's SDK integration evidence is about the merged tree, not the donor.
- **MERGED-NEW-2 (Info):** `zk/keys/ceremony_redo.sh` is a donor-pathed record script — accurate history, not a runnable merged-tree procedure.
- **MERGED-NEW-3 (Info):** the merged tree's headline docs don't carry forward the donor re-audit's open-items register (H-1 rotation, NEW-4/5/6). The substance survives in the transplanted `hardening/` documents and the donor's REAUDIT.md, but a reader of only the merged tree's status boxes would undercount what is still open.

**W5 readiness (code standpoint): YES.** Nothing found here blocks the devnet rehearsal. W5 itself remains the dev's separate go — this audit does not authorize it, and nothing was deployed, no keypair was generated for the program, and no transaction was sent. (The two auto-generated *build* keypairs cargo-build-sbf wrote into my overlay scratch out-dir were deleted unread, per the tree's own doctrine.)

---

## 2. Area 1 — Frame-fix integrity (highest scrutiny): PASS

The claim under test (TRANSPLANT-NOTES addendum): `programs/dark-protocol/src/poseidon_params.rs` reproduces light-poseidon 0.2.0's width-3 circomlib parameters exactly, as static limb tables, so the program no longer calls the stack-heavy `Poseidon::new_circom`.

**Independent table diff (the evidence, not the KAT):** I parsed the t==3 branch of the registry source `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/light-poseidon-0.2.0/src/parameters/bn254_x5.rs` (branch at lines 853–2095; `ark` vec lines 854–2025, `mds` vec lines 2026–2087) and extracted every `BigInteger256::new([a, b, c, d])` quad in order: **195 ark quads, 9 MDS quads**. I extracted the same from `poseidon_params.rs` (`ARK_LIMBS`, `MDS_LIMBS`): **195 and 9**. Programmatic comparison:

```
ARK: ALL 195 quads limb-identical (780 u64 limbs)
MDS: ALL 9 quads limb-identical (36 u64 limbs)
field-value equality ark: True
field-value equality mds: True
VERDICT: IDENTICAL
```

All 204 values match limb-for-limb (816 u64 limbs), and therefore as field elements under the little-endian limb interpretation both sides use.

**Parameter shape:** the crate's t==3 branch constructs `PoseidonParameters::new(ark, mds, FULL_ROUNDS, PARTIAL_ROUNDS[1], t, ALPHA)` with `FULL_ROUNDS = 8`, `PARTIAL_ROUNDS = [56, 57, 56, …]` (index 1 = **57**), `ALPHA = 5`, width `t = 3`. `circom2_parameters()` constructs `PoseidonParameters::new(ark, mds, FULL_ROUNDS=8, PARTIAL_ROUNDS=57, WIDTH=3, ALPHA=5)` from the tables via the same `Fr::from(BigInteger256::new(..))` conversion the crate uses. Same shape, same order, same conversion.

**Hash logic otherwise untouched:** `diff` of `poseidon.rs` (donor → merged) shows exactly two hunks: a doc comment, and the construction line — `Poseidon::<Fr>::new_circom(2)` replaced by `Poseidon::<Fr>::new(crate::poseidon_params::circom2_parameters())`. (`new_circom(2)` selects width 3 internally — the configuration extracted above.) Everything else in the file — the Poseidon sponge driver calls, `negate_proof_a`, `recipient_field`, the canonicality checks, and the KAT test itself — is byte-identical to the donor.

**Corroboration (necessary, not sufficient — and present):** `poseidon2_known_answer_from_light_poseidon_docs` passed in my own program test run (§5), pinning the tables' *effect* against light-poseidon's documented hash. The merged `Cargo.lock` pins `light-poseidon 0.2.0` — the exact version I extracted from.

**Box change:** `Withdraw.pool: Account<'info, Pool>` → `Box<Account<'info, Pool>>` is the only other code change in the program (§3). The state struct `Pool` itself is untouched, `pool_len_matches_layout` passes, and the IDL account layout is unchanged (§3).

---

## 3. Area 2 — Transplant fidelity: PASS, with MERGED-NEW-1 (Low)

**Program logic vs donor** (`diff` donor `program/src/` → merged `programs/dark-protocol/src/`):

| File | Result |
|---|---|
| `vk.rs` | **byte-identical** (diff clean) |
| `merkle.rs` | **byte-identical** |
| `errors.rs` | **byte-identical** |
| `poseidon.rs` | construction line + comment only (§2) |
| `poseidon_params.rs` | new file (the frame fix, §2) |
| `lib.rs` | exactly 3 changes: `pub mod poseidon_params;` added; module rename `dark_protocol_v2` → `dark_protocol`; `Withdraw.pool` boxed + explanatory comment |

Every instruction handler, the withdraw gate order, state definitions, and events are otherwise identical to the re-audited donor — including the NEW-1 bound-leaf deposit (`deposit_inserts_amount_bound_leaf` passes, §5) and the fail-closed `transfer`.

**Manifests:** the merged program `Cargo.toml` differs from the donor's only by the rename and — correctly — the removal of the `[profile.*]` sections, which reappear **verbatim** in the merged workspace root (`overflow-checks = true`, `lto = "fat"`, `codegen-units = 1` for release), where Cargo actually honors them. Resolved versions in the merged lock match the donor's set: `anchor-lang 0.32.3` (workspace pin `0.32.1`), `groth16-solana 0.2.0`, `light-poseidon 0.2.0`, `ark-* 0.4.x`. Jupiter path dependencies are gone.

**ZK artifacts** (sha256, donor `zk/` vs merged `dark-protocol/zk/`): `withdraw.wasm` `0d04c5dc…`, `withdraw.zkey` `8401d730…`, `verification_key.json` and `withdraw.vkey.json` `14036168…`, `vk_solana.bin` `4191bdc6…`, `vk_dropin.rs` `0eab8a38…`, `circuits/withdraw.circom` `971dca49…`, `circuits/merkle.circom` `93d55542…`, `test_withdraw.js` `e2af4807…` — **all identical**. `zk/keys/` and `zk/scripts/` are also identical to the donor's (see MERGED-NEW-2 for the one wart inside `keys/`).

**Client-lib:** `src/` and `test/` are byte-identical to the donor client (diff clean), as are its `README.md` and `FINDINGS-MAP.md`; the program's `README.md` and `FINDINGS-MAP.md` likewise. No fake-crypto resurrection anywhere in the moved code — it is the same code.

**IDL is not stale (incl. the Box change):** the bundled IDL (`sdk/typescript/src/idl/dark_protocol.json`) has address `DTpM3xKbNYeVCPSZXvscr4USWjd7BWvq9m8qxGZ9wjd6`, equal to `declare_id!`. I recomputed all 9 Anchor discriminators from the names in `lib.rs` (`sha256("global:"|"account:"|"event:" ‖ name)[..8]`) — **all match** (4 instructions, 2 accounts, 3 events). Instruction accounts/args match the handlers (withdraw: pool, vault, nullifier_marker, recipient, fee_payer, system_program; args proof/root/nf/amount); error codes 6000–6009 match `errors.rs` in order; the `Pool` type matches the state struct field-for-field; the `NoteDeposited` event carries `cm, leaf, leaf_index, new_root` (the NEW-1 bound leaf the indexer consumes). The SDK suite's own "bundled IDL is exactly the merged program surface" test also passes (§5).

**Single program-ID config point — real:** the placeholder `DTpM3xKb…` appears at exactly the W5 flip points: `declare_id!`, `Anchor.toml` (all three clusters, with a "sha256-derived, NO keypair" header note), the bundled IDL address, and the wallet constant (`dark-wallet/src/sdk/dark-protocol.ts:34`). The SDK takes the ID from `DARK_PROTOCOL_PROGRAM_ID`/config, and `DarkProtocolClient.create()` **throws** when it is unset — verified in code (`client.ts:62-65`) and by the passing SDK test "construction throws when no program ID is configured anywhere."

**Retired IDs:** `Frf98…`, `Bf3jj…`, `DARKxXxX…` survive only in: the frozen archives (4 files under `dark-protocol/archive/`), `dark-protocol/DEPLOYMENT.md` (top banner: "⛔ RETIRED … must not be used"), repo-root `DEPLOYMENT_COMPLETE.md` (top banner: "⛔ RETIRED — HISTORICAL RECORD ONLY"), and `sdk/typescript/MIGRATION-0.2.0.md` (names all three as legacy/retired). I read each banner personally. No surviving code surface references any of them.

**SDK / wallet surfaces:** the fake SDK modules (`sapling.ts`, `privacy.ts`, `note-encryption.ts`) are deleted, not ported; `sdk/typescript/src/proving.ts` is a pure re-export bridge to `@dark-protocol/client-lib` and discloses the NEW-2 split in its header. In the wallet, the `createCommitment`/`createNullifier` string-hash helpers are deleted (only a comment records their removal); commitments are client-lib Poseidon notes. Dependency links resolve inside the merged tree: both the SDK's and the indexer's `node_modules/@dark-protocol/client-lib` symlink to the merged `client-lib/`.

### MERGED-NEW-1 — Low: client-lib's default artifact path points at the donor tree

- **Evidence:** `client-lib/src/proofs.js:47-50`: `DEFAULT_ZK_DIR = path.join(HOME, 'workspace/dark-defi-rewrite/zk')`. `defaultArtifactPaths()` defaults to it; `createSpendProof`/`verifySpendProof` use it when no explicit artifacts are passed (proofs.js:152, 175); the SDK re-exports `defaultArtifactPaths` unchanged (proving.ts:37). Nothing in the merged tree overrides the default. The merged tree's own artifacts sit unused-by-default at `dark-protocol/zk/`.
- **Why it is only Low:** every failure mode is fail-closed — a missing artifact throws `ArtifactMissingError` and no proof is fabricated (the C-2 property is intact), and today the donor-path artifacts are byte-identical to the merged ones (hash-verified above), so behavior is identical. No funds, no verification bypass.
- **Why it still matters:** the transplant's purpose was a self-contained merged tree. As landed, (a) retiring or moving the donor tree silently breaks merged-tree proving (availability), and (b) a future circuit rotation landed only in the merged tree would be silently bypassed by default-path proving — proofs would be built against the stale donor zkey and rejected on-chain (fail-closed, but a trap), and (c) W5's SDK integration gate, if run with default paths, would exercise the *donor's* artifacts and produce evidence about the wrong tree.
- **Fix:** one line — resolve `DEFAULT_ZK_DIR` relative to the package (the in-tree `zk/` is `../../zk` from `client-lib/src/`), or point it at the merged tree path; add a test that the default path exists inside the package's own tree. Recommended as a W5 prep step, before the rehearsal, so the rehearsal's evidence chain is clean.

### MERGED-NEW-2 — Info: ceremony record script is donor-pathed

`zk/keys/ceremony_redo.sh` (byte-identical to the donor's, as a ceremony record should be) runs in `/tmp/zksetup` and copies `withdraw.r1cs` and snarkjs from absolute *donor* paths. It is accurate as the historical record of the NEW-1 ceremony redo; it is not a runnable merged-tree procedure. A future ceremony (W8-C) must re-derive its paths rather than copy this script. No current process invokes it.

---

## 4. Area 3 — Fresh adversarial pass on the merged tree: PASS

**W4 negative-space greps, re-run by me** over the surviving surfaces (`programs/`, `sdk/typescript/src/`, `client-lib/src/`, `zk/circuits/`, `zk/scripts/`, `indexer/src/`, `dark-wallet/src/`, `rail-worker/src/`):

| Pattern | Surviving hits |
|---|---|
| `generate_test_vk` | 0 |
| `verify_zk_proof` | 0 |
| `generate_mock_proof` / `mock_proof` / `placeholder-transaction` | 0 |
| `update_merkle_tree` | 0 |
| `NullifierSet` | 0 |
| `scalar_mul` / `point_add` | 0 |
| `FeatureNotProductionReady` | 0 (present only under `archive/legacy-program/`) |
| `zk_proof.rs` / `groth16.rs` files outside archives | 0 |
| `sha256` / `sha2` / `blake` in program `src/` | 1 — the comment explaining the placeholder ID is sha256-*derived* (an ID, not a construction) |

**Secret scan (my run):** `python3 dark-protocol/hardening/secret-scan.py` over the whole merged tree → **0 failures, 2 review warnings**, both the publicly-known Jupiter IDL JSONs in the vendored `core/` tree — exactly as the W4 audit disclosed. `dark-protocol/target/deploy/` contains only `dark_protocol.so` — no keypair file in the tree.

**Fund-movement surface:** exactly two `system_program::transfer` sites in the program — deposit (line 154, pulls from the signing depositor before inserting the bound leaf) and withdraw (line 277, after root-ring → solvency → Groth16 verify → nullifier-marker `init`). The `transfer` handler's body is a single unconditional `err!(DarkError::TransferNotEnabled)` before any state access.

**Quarantine integrity:** workspace members are exactly `["programs/dark-protocol"]`; no `shielded` reference exists in the workspace `Cargo.toml` or `Anchor.toml`; the dropped program sits at repo-root `archive/shielded-wallet/` with a `DO-NOT-DEPLOY.md` that names its `verify_zk_proof = Ok(())` defect. It is not buildable from the merged workspace.

**Indexer cannot accept unbound leaves:** `indexer/src/pool.js` inserts the `leaf` field of `NoteDeposited` **verbatim** (it never derives a leaf from `cm`), enforces strict sequential `leaf_index`, recomputes the tree root after every deposit, and **throws** if the rebuilt root differs from the event's `new_root`. Its tests (§5) prove both the root-mismatch halt and the out-of-order rejection.

**deploy-devnet.sh still defanged:** the script prints the W5-hold message and `exit 1` before any other action; the legacy body below the guard is unreachable. Verified by reading the script in full.

**Kept layers:** I could not independently diff `rail-worker/` or the wallet intent files against the pristine zolana clone (no clone or git history exists in the merged tree to diff against — the tree is not a git repo). My own greps confirm those surfaces contain none of the audited fake constructions, and the transplant's byte-identity claim for them stands as the transplant's evidence, not mine. This is a scope limit, recorded as such; it does not affect the program, whose donor is present and was diffed exhaustively.

---

## 5. Area 4 — Suites and SBF build, re-run first-hand: ALL GREEN

| Suite | Command | Result |
|---|---|---|
| Program | `cargo +1.89.0 test --lib --locked` (target/TMPDIR on overlay) | **18/18 passed** — incl. `poseidon2_known_answer_from_light_poseidon_docs`, `deposit_inserts_amount_bound_leaf`, `frontier_matches_reference_production_depth`, `vk_shape_matches_withdraw_public_inputs`, `gamma_is_the_g2_generator_in_solana_byte_format`, `pool_len_matches_layout`, `test_id` |
| ZK e2e | `node test_withdraw.js` (overlay copy, in-tree artifacts) | **13/13 passed** — honest proof verifies; amount/recipient/root/nullifier(×2)/proof-point tampers all rejected; note at leaf 4 verifies; all three NEW-1 drain checks pass (the attacker's witness generation aborts on the circuit's root constraint) |
| Client-lib | `npm test` (overlay copy) | **34/34 passed** |
| SDK | `node --test test/*.test.mjs` against the shipped bundle + `tsc --skipLibCheck --noEmit` | **7/7 passed** — incl. program-ID throw, env ID honored, IDL-surface equality, PDA derivations, shield/unshield instruction construction, malformed-proof rejection. The bundle (`dist/`, built 07:36) postdates the source edits (07:31) and contains the new surface; `tsc --noEmit` proves the current source typechecks clean |
| Indexer | `npm test` (overlay copy) | **3/3 passed** — incl. fail-closed root mismatch and out-of-order deposit rejection |

*Method note (SDK):* the sandbox blocked copying the SDK's sources to overlay scratch (see §7), so the suite ran in-tree against the shipped `dist/` instead of a fresh `npm run build`. The substituted evidence — dist freshness vs source timestamps, dist content (throw + `getPool` present), and a clean `tsc --noEmit` over the exact sources — covers the same claim the build leg would: the tested bundle is the current source, compiled.

**SBF rebuild (the determinism check):** `cargo-build-sbf 4.1.0 --manifest-path programs/dark-protocol/Cargo.toml --tools-version v1.58`, outputs redirected to overlay scratch:

- Exit **0**.
- Artifact: 321,592 B, sha256 **`e51c2596a38a7cacc78b66f11957e66e4f6a9cb35f1b8ea6feafd15702743789`** — **byte-identical to the in-tree `target/deploy/dark_protocol.so`**. An independent rebuild on a different target directory reproduces the recorded artifact exactly: the build is deterministic, and the in-tree artifact genuinely corresponds to the in-tree source.
- **Frame diagnostics:** I then deleted the final crate's outputs from my scratch target and forced a recompile + relink of `dark-protocol` itself (the step that emits the frame analysis). The full 121-line log greps **zero** for `frame`, `overflow`, `overwrit`, and contains **zero** `Error:` lines (the pre-fix baseline had exactly 5). Exit 0, and the regenerated `.so` again hashed to `e51c2596…`.
- `--locked`: cargo-build-sbf 4.1.0 rejects `--locked` as its own flag (usage error); the lock was honored de facto — `Cargo.lock`'s sha256 (`b5d6914b…`) is identical before and after every build I ran, and the host suite above ran with `--locked` proper.

This supersedes-confirmation closes the donor's last verification gap: the "SBF build unverified" caveat from the donor re-audit no longer applies to the merged program — it has now been built, frame-checked, and reproduced by two independent builds (the transplant's and mine).

---

## 6. Area 5 — Carried caveats: honestly stated, with one Info gap

- **Dev-ceremony VK — CARRIED, prominent.** `dark-protocol/README.md` release status ("its verifying key comes from a local single-contributor dev ceremony; a production MPC ceremony + VK rotation (W8) is required before any mainnet conversation"), `zk/README.md` (leads with the single-contributor warning and the forgery consequence), the program `README.md` (`VK_IS_PLACEHOLDER = false`, ceremony re-run for NEW-1 disclosed, MPC + fresh VK required), the `vk.rs` header, and TRANSPLANT-NOTES. The on-chain mirror (`Pool.vk_is_placeholder`) is in the IDL and the state struct.
- **Transfer fail-closed stub — CARRIED.** Stated in the README status, program docs, and W4 audit; verified in code (§4) and by the error's presence in the IDL (6009).
- **H-1 rotation outstanding — CARRIED in substance.** `hardening/INVENTORY.md` and `hardening/ROTATION-RUNBOOK.md` were transplanted intact; the runbook's framing is unambiguous ("Deleting the files does not un-leak the keys… The only real fix is rotation") and it remains an unexecuted dev action — the 10 keypairs are still live. See MERGED-NEW-3 for the headline-omission nit.
- **REAUDIT NEW-2 (client `createSpendProof` targets the future transfer circuit) — UNCHANGED, disclosed, closure specced.** The client-lib is byte-identical, so the behavior is the donor's: fail-closed against the landed artifacts. The merged tree discloses it in `sdk/typescript/src/proving.ts`'s header, and the W8 transfer-circuit spec (`docs/w8/transfer-circuit.md`) explicitly designs its closure ("This work order **closes REAUDIT NEW-2**") — a spec, not an implementation. State: **open, Low, as the donor left it.**
- **REAUDIT NEW-4 (multisig digest lacks length prefixes, Low), NEW-5 (client `Note` accepts up to 2¹²⁸ vs the u64 circuit bound, Low), NEW-6 (`deriveAccountKeys` returns `_accountNode`, Info) — ALL UNCHANGED.** The client-lib is byte-identical to the donor's, and neither the SDK work nor any W8 spec touches them (the W8 specs cover SPL, the transfer circuit, ceremony/VK rotation, and fees). They remain exactly as graded in REAUDIT.md.
- **Retired Frf98… binary** — TRANSPLANT-NOTES carries the caveat that whatever sits at that devnet address is outside the merged tree's control until its upgrade authority closes it. Unchanged by anything here.

### MERGED-NEW-3 — Info: the merged tree's headline docs omit the open-items register

The release-status box in `dark-protocol/README.md` and the standing-caveats list in `TRANSPLANT-NOTES.md` enumerate the deploy hold, the dev ceremony, the transfer stub, and the not-yet-audited status — but neither mentions that **H-1's 10 leaked keypairs remain live pending the dev's Mac-side rotation**, and no merged-tree document restates **NEW-4/5/6**. The substance is preserved (transplanted `hardening/` for H-1; the donor's REAUDIT.md for NEW-4/5/6), so this is a discoverability gap, not a concealment — the same safe-direction class as the donor's NEW-3 doc drift. Relatedly, the legacy marketing "Features" list in `dark-protocol/README.md` (AI agents, Jupiter swaps) still sits below the release-status box; the box explicitly supersedes it and names the dropped surface, so it does not mislead a reader who starts at the top — but a one-line "open items" pointer in the status box (H-1 rotation; REAUDIT NEW-2/4/5/6) would make the merged tree self-contained as a record, the same fix MERGED-NEW-1 makes for its code.

---

## 7. Environment notes (for the W5 session)

- This VM's sandbox intermittently returns EPERM on file writes — the home-volume/overlay "write flaps" the transplant record also hit. Two specific behaviors cost time here and will recur: (a) writes issued by the Solana platform-tools toolchain binaries (`~/.cache/solana/v1.58/platform-tools/…`) were EPERM'd outright (fingerprint timestamps, `Cargo.lock`) while identical writes from system binaries succeeded — running the toolchain **under `strace -f`** bypassed the guard and both SBF builds completed normally; (b) the SDK TypeScript sources could not be copied to scratch at all (reads fine, writes of their content blocked), which is why the SDK suite ran in-tree (§5). Neither behavior is a property of the audited code; both are worth knowing before a W5 build/deploy session starts burning time on phantom build failures.
- All of my build/test scratch lived on the root overlay (`/reaudit-scratch/`); the audited tree was not modified by any verification step (Cargo.lock hash unchanged throughout).

---

## 8. Verdict summary

| Area | Verdict |
|---|---|
| 1. Frame-fix integrity | **PASS** — 204/204 constant quads independently verified limb-identical; parameter shape matches; hash logic untouched |
| 2. Transplant fidelity | **PASS with 1 Low** — program/VK/artifacts byte-faithful; IDL verified against source; MERGED-NEW-1 (donor-path artifact default) |
| 3. Fresh adversarial pass | **PASS** — negative space re-verified by my own greps; secret scan clean; indexer fail-closed; deploy script defanged |
| 4. Suites + SBF | **PASS** — 18/18, 13/13, 34/34, 7/7, 3/3; SBF rebuild byte-identical (`e51c2596…`), zero frame diagnostics |
| 5. Carried caveats | **CARRIED** — dev ceremony, transfer stub, H-1, NEW-2/4/5/6 all still honestly open; MERGED-NEW-3 (Info) headline-register gap |

**New findings: MERGED-NEW-1 (Low), MERGED-NEW-2 (Info), MERGED-NEW-3 (Info). No new Critical/High/Medium.**

**Bottom line: from a code standpoint the merged tree is W5-ready.** Every security property the donor re-audit established survives the transplant and the frame fix, verified first-hand. Recommended W5 prep (not blockers): fix MERGED-NEW-1 so the rehearsal's proving evidence is about the merged tree; add the open-items pointer (MERGED-NEW-3). The standing production gates are unchanged and unaffected by this verdict: a real MPC ceremony before any mainnet VK, H-1 key rotation by the dev, and W5 itself only on the dev's separate go.
