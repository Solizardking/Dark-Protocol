# Dark Protocol (v2) — Certora CVLR results

Program: `dark-protocol` v2, `declare_id 2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (devnet).
Repo: Solizardking/dark-protocol, branch `feat/certora-cvlr-specs`, base commit `04653bcca`.
Suite built 2026-11-24. Scope, axioms A1–A6 and modelling notes: see `SURVEY.md`.
Property numbering follows `aristotle/dark-protocol_spec.md` (Properties 0–6).

## Status summary

- Spec suite: **written and compiling** — 37 rules (36 in confs, 1 A3-conditional
  rule written but deliberately excluded from every conf).
- Host check: **PASS**. Certora compile gate: **PASS** (exit 0).
- Cloud submission: **SUBMITTED 2026-11-24** — P3 deposit binding, job
  `dcd7c7e674f6422d8fd1666e6a91e40d` (see "Cloud run — 2026-11-24").
- Property verdicts: P3 **UNKNOWN ×9** — prover rule-encoding failure
  ([6000] stack offset), a prover-side wall, not a finding about the
  program. All other properties **NOT RUN.**

## Artifact record (read before claiming anything about the deployed program)

- **Source identity — proven.** Every file of this crate is sha256-identical to
  `~/workspace/zolana-transplant-merge/dark-protocol/programs/dark-protocol/`,
  the tree the deployed devnet program was built from (verified in the
  2026-11-24 scoping pass and re-verified for `src/lib.rs` during this build).
- **Deployed artifact (W5 rehearsal records):** 278,040 B, sha256 `97187978…`.
- **Local rebuild (2026-11-24):** `cargo-build-sbf 4.1.0`, platform-tools
  v1.58, locked dependencies → 279,264 B, sha256
  `863ceeb89b55cc53595b4060e7611c7bfb3cdf94c85bc27b57357c4ac6cab622`.
  The clone build and a control build of the merged tree at its canonical
  path are **byte-identical to each other** (`cmp` clean) — and **neither
  reproduces the W5 artifact** (+1,224 B).
- **Diagnosis.** Source differences and build-path embedding are excluded by
  the control build. The remaining explanation is the historical build
  environment: the merged tree's `Cargo.lock` on disk post-dates the
  rehearsal build, so the 2026-11-17 dependency resolution / toolchain
  state is not recoverable from the repo alone.
- **Consequence.** This suite verifies the **source** (byte-identical to the
  deployed program's source tree). No result obtained with it may be stated
  as a verdict on the deployed artifact's bytes until the artifact delta is
  resolved (recover the 2026-11-17 lock state, or dump the deployed program
  and compare instruction streams). `confs/prebuilt.conf` documents the
  discipline for artifact-specific runs.
- **RESOLVED 2026-11-24** — the dump-and-compare route was taken; verdict
  **COSMETIC** (instruction semantics identical). See the next section,
  which supersedes the "Consequence" above and refines the diagnosis.

## Artifact delta — RESOLVED 2026-11-24 (verdict: COSMETIC)

Method: dumped the deployed program from devnet and compared instruction
streams against the local rebuild (`863ceeb8…`, 279,264 B). Scratch
evidence (untracked, reproducible by this method):
`.artifact-check/deployed.so` (raw ProgramData payload) and
`.artifact-check/deployed_trimmed.so` (the 278,040 B ELF).

**The deployed bytes are exactly the rehearsal artifact.** Read-only
`getAccountInfo` (Helius devnet) on ProgramData
`FfN9PpFrCH9bV1ceVhK2pmXrfmWtuPtVJ7HQcof6sKqF` — the program account
`2GmpuVGf…` was first verified to point at this ProgramData (owner
BPFLoaderUpgradeable). Account data 331,877 B; header: state =
ProgramData, last-deploy slot 523,439,600, upgrade authority
`RQJB3zHzphrNqxFXQVYLuELUoneMDGyErTX1P4jSouW` (matches the rehearsal
records). The ELF's own section headers end at 278,040 B; the remaining
53,792 B of account data are all-zero allocation slack. Trimmed ELF
sha256 = `9718797889ab59d20bb721e4f6c15eaef0c24a2b86c4ee5e377b09fe6d63debb`
— byte-identical to the W5 rehearsal artifact.

**Comparison (deployed vs rebuild).**

- ELF structure: same 9 sections, same order and types; `.dynsym`,
  `.dynstr`, `.shstrtab` byte-identical. The only section size difference
  in the file is `.rodata` +1,224 B — the entire file delta.
- `.rodata`: 99.34% of deployed bytes lie in identical blocks; **every**
  difference is inside panic-location file-path strings. The deployed
  build embeds crate-relative paths (`src/fields/fq.rs`,
  `src/groth16.rs`, `library/core/src/fmt/mod.rs`, …); the rebuild
  embeds absolute host paths
  (`/home/hatch/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/<crate>-<version>/src/…`).
  The crate versions named in the paths are identical in both builds
  (ark-ff 0.4.2, ark-bn254 0.4.0, anchor-lang 0.32.3, groth16-solana
  0.2.0, borsh 0.10.4, bincode 1.3.3, num-bigint 0.4.8, solana-pubkey
  2.4.0, solana-account-info 2.3.0, solana-instruction 2.3.3,
  solana-rent 2.2.1, solana-program-entrypoint 2.3.0). This refines the
  earlier diagnosis: dependency resolution matches — the delta is the
  build environment's path remapping (the 2026-11-17 build remapped
  registry paths to crate-relative form; the 2026-11-24 local build did
  not), not Cargo.lock drift in versions.
- `.text`: 241,744 B / 30,218 instructions, same size in both. Only
  1,413 bytes differ, all inside `lddw` immediates — **zero** opcode,
  register, or branch-offset differences. Full disassembly of both
  (llvm-objdump, relocations applied; 28,312 lines each): the only
  differing lines are 707 `lddw` operands, classified by effective
  (relocated) target: **502** point at byte-identical `.rodata` content;
  **192** point into post-`.rodata` sections shifted by exactly +0x4c8
  (the `.rodata` growth); **7** point at the same logical small string
  (`nf`, `system_program`, …) stored with different packing; **6** point
  at `core::fmt` panic-piece arrays whose only content difference is the
  relative-vs-absolute path piece. Zero unexplained.
- `.data.rel.ro`: 914 u32 words, 158 differ — 42 (pointer, length) pairs
  for the path strings (pointer → the corresponding absolute-path
  string; length 10–27 → 91–107), 72 pointers to byte-identical
  content, 2 section pointers shifted +0x4c8.
- `.rel.dyn`: 995 entries — 817 byte-identical; 178 differ only in
  `r_offset` shifted +0x4c8 with identical `r_info`; 0 other.
- `.dynamic`: 3 address fields (DT_REL, DT_SYMTAB, DT_STRTAB) shifted
  +0x4c8.

**Verdict: COSMETIC.** The instruction stream is semantically identical;
the +1,224 B is entirely the longer embedded panic-location path strings
plus the resulting layout shift. No logic difference was found anywhere.

**Updated claim discipline.** Results from this suite may be stated as
verdicts on the deployed program's **logic** — source identity and
instruction-stream equivalence to the deployed artifact are both now
proven. They may **not** be stated as byte-identity between the local
build and the deployed artifact (the bytes differ, cosmetically). For
artifact-exact claims, `confs/prebuilt.conf` with the dumped binary
(sha256 `97187978…`) remains the route.

## Wiring invariance (feature off ⇒ production build unchanged)

- Post-wiring feature-off SBF build: 279,264 B, sha256
  `0af80d22af2b4a99f0dd80077188abaa9676070438a14e8f08c4b1b356f2ca95`.
- Byte-diff vs the pre-wiring build: **exactly 21 bytes differ, every one a
  +3 shift** — the embedded panic-location line numbers in `lib.rs`, moved
  by the 3-line `#[cfg(feature = "certora")] pub mod certora;` addition
  (one differing field is a two-byte little-endian +3). The instruction
  stream is byte-identical. The certora wiring changes no program behavior.

## Compile checks

- Host: `cargo check -p dark-protocol --features certora` (rustc 1.89.0,
  anchor-lang 0.32.3) — **PASS, 0 errors.** Spec-authoring fixes needed on
  the way (harness construction only; **no assertion was weakened or
  removed**):
  - Anchor 0.32 caches bumps only for `init`-with-seeds or untargeted
    `bump` constraints → `DepositBumps` / `TransferAccountsBumps` are empty
    structs, `WithdrawBumps` carries only `nullifier_marker`.
  - Anchor 0.32 `Error::ProgramError` wraps `Box<ProgramErrorWithOrigin>`;
    the custom code is read from its `program_error` field.
  - Anchor's `TryFrom<&'info AccountInfo<'info>>` impls require a
    `&'static AccountInfo<'static>`; the harness leaks the `AccountInfo`
    values (`harness::leak_info`) and keeps state-sharing clones for
    post-state reads.
- Certora gate: `cargo certora-sbf --tools-version v1.53 --features certora`
  (certora-cli 8.20.3, platform-tools v1.53) — **PASS, exit 0.**
- Resolved spec dependencies (local, uncommitted `Cargo.lock` copy — the
  repo ships no lockfile): cvlr 0.6.2, cvlr-solana 0.5.2.

## Toolchain frame-analysis findings (prover-readiness caveats)

The Certora toolchain's stack analysis reports functions exceeding the
4,096-byte maximum frame offset (printed as `Error:` diagnostics; the gate
still exits 0). A prover run does **not** tolerate them — confirmed by the
first cloud submission (2026-11-24), where this wall blocked every P3 rule
at rule encoding. See "Cloud run — 2026-11-24" below.

- `dark_protocol::Pool::try_deserialize_unchecked` — estimated frame
  9,088 bytes; accesses an offset 4,992 bytes greater than the maximum of
  4,096.
- `dark_protocol::TransferAccounts::try_accounts` — estimated frame
  5,696 bytes; accesses an offset 1,600 bytes greater than the maximum of
  4,096.

These are properties of the program's own Anchor-generated code under the
v1.53 Certora toolchain (the `Pool` account is ~2.4 KB and is deserialized
by value). They are recorded verbatim as findings, not worked around:
addressing them would require program-code changes, which are out of
scope for the spec suite.

## Per-property status

| Property | Rules in conf | Status |
|---|---|---|
| P0 no-UB / no-panics | 5 | NOT RUN |
| P1 ledger conservation | 7 | NOT RUN |
| P2 withdraw gating | 5 | NOT RUN |
| P3 deposit binding (first submission target) | 9 | UNKNOWN ×9 — rule encoding failed ([6000] stack offset), job `dcd7c7e6…` |
| P4 authority impotence | 3 | NOT RUN |
| P5 progress + error classification | 2 in conf (+1 A3-conditional rule excluded) | NOT RUN |
| P6 root / frontier integrity | 5 | NOT RUN |

## Cloud run — 2026-11-24 (P3 deposit binding, first submission)

The precondition landed the same day: the RedPill Phase 0 run exercised
the shared `CERTORAKEY` against Certora's cloud and it was accepted (the
CLI notes it is a legacy key; legacy keys still work). P3 was submitted
the same day, with `CERTORAKEY` loaded into the prover process
environment only.

- **Job:** `dcd7c7e674f6422d8fd1666e6a91e40d` —
  https://prover.certora.com/output/7499856/dcd7c7e674f6422d8fd1666e6a91e40d
- **Window (UTC):** submitted 2026-11-24T19:45:33Z; prover start
  19:48:17Z; finished 19:48:52Z. Job-level status `SUCCEEDED`, exit
  code 0.
- **Route:** `confs/run.conf` + `--rule <the 9 P3 rule names>` +
  `--cargo_tools_version v1.53`. The per-property conf's
  `"files": ["run.conf"]` inheritance hits the same certora-cli 8.20.3
  rejection the RedPill run documented (`run.conf does not end with
  .so`), so the working route from that run was used; **no conf file
  was edited.** Sources mode; local build via `cargo certora-sbf
  --tools-version v1.53` (submitted `.so` sha256
  `695c610b339fbd3475daf1dadf060dfb09d3e1591a51b1adac622c90a035474b`).
- **Source revision:** `f12798c80` (this branch). The run executed from
  a byte-identical mirror of this clone on overlay scratch because the
  home volume was refusing all writes (EDQUOT) at submission time.

### Verdicts — P3: 9/9 UNKNOWN (prover-side encoding failure)

Every rule — and every rule's vacuity check — failed **rule encoding**
before any SMT solving, with the verbatim error class:

`verifier.RuleEncodingException: [6000] Current stack size is 4096 and
stack offset exceeded max offset by 136`

for 8 of 9 rules; `rule_p3_second_deposit_chains_bound_leaves` (and its
vacuity check) exceeded by **2,240**. 36 exception reports in total
(9 rules × rule + vacuity × 2 encoding passes) — the same reporting
shape as the RedPill run. Per rule, all UNKNOWN:
`rule_p3_zero_amount_rejected_before_any_effect`,
`rule_p3_zero_commitment_rejected_before_any_effect`,
`rule_p3_noncanonical_commitment_rejected_before_any_effect`,
`rule_p3_tree_full_rejected`,
`rule_p3_first_deposit_inserts_bound_leaf`,
`rule_p3_inserted_leaf_binds_this_amount_not_another`,
`rule_p3_second_deposit_chains_bound_leaves`,
`rule_p3_bound_amount_is_the_transferred_amount`,
`rule_p3_deposit_is_reachable`.

These are prover-side failures: **not** counterexamples, and not
evidence about the program or the specs in either direction. No rule
was proven or refuted. (No [3308]/[3006] pointer-analysis errors appear
in this job — Dark's wall is a different one from RedPill's.)

This is the cloud manifestation of the frame-size wall recorded
pre-submission in "Toolchain frame-analysis findings" above: the
program's Anchor-generated deserialization frames exceed the 4,096-byte
maximum frame offset the SBF→TAC encoder accepts. The local analysis
named `Pool::try_deserialize_unchecked` (frame ≈9,088 B) and
`TransferAccounts::try_accounts` (≈5,696 B); the cloud error reports
the excess at the encoding site — 136 B for most rules, 2,240 B for
the two-deposit rule — rather than per-function frame totals, so the
numbers are not expected to correspond one-to-one; the error class is
the same. Clearing it requires program-code changes (out of scope for
the spec suite) or a Certora toolchain that lifts the frame limit.

### The doubled-prefix warning — present here too

This job's log also contains, verbatim:

`WARN SBF - Some problem occurred while reading
./.certora_sources/.certora_sources/dark-protocol-certora/dark-protocol/programs/dark-protocol/src/certora/envs/cvlr_summaries.txt`

and the same for `cvlr_inlining.txt`. The doubled `.certora_sources`
prefix therefore appears in the Dark run as well as in all six RedPill
jobs: the env-file loading defect is **pipeline-wide**, not specific
to either suite. In this run it is not the proximate cause — the
[6000] stack-offset wall is independent of the pointer-analysis
summaries / inlining the env files carry — but both defects are
Certora-side and both are recorded here for the report to Certora.

### Next steps

1. Raise both defects with Certora (support / a newer certora-cli):
   the doubled `.certora_sources` env path, and the [6000] frame
   limit against Anchor programs with large account structs.
2. P1 conservation was **not** submitted: per the run plan it was
   conditional on P3 returning real verdicts, and it will hit the
   same [6000] wall (the same deserialization frames sit on the
   deposit/withdraw paths) until the wall clears.
3. If the frame limit cannot be lifted Certora-side, the remaining
   route is a program-side change to shrink the deserialization
   frames — a dev decision, explicitly out of this suite's scope.

Counterexamples, if any future run produces them, will be recorded
here verbatim as findings — never spec-fixed away.

## Not claimed

Groth16 soundness, circuit correctness, the trusted setup, and Poseidon
collision resistance (axiom A2, P3 only) are **not** proven by this suite,
even once runs pass. Byte-identity between the local build and the
deployed artifact is likewise **not** claimed (the bytes differ,
cosmetically); per the Artifact delta resolution above, verdicts may be
tied to the deployed program's logic via the proven instruction-stream
equivalence. Full boundary list: `SURVEY.md`.
