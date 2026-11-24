# Dark Protocol (v2) — Certora CVLR results

Program: `dark-protocol` v2, `declare_id 2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (devnet).
Repo: Solizardking/dark-protocol, branch `feat/certora-cvlr-specs`, base commit `04653bcca`.
Suite built 2026-11-24. Scope, axioms A1–A6 and modelling notes: see `SURVEY.md`.
Property numbering follows `aristotle/dark-protocol_spec.md` (Properties 0–6).

## Status summary

- Spec suite: **written and compiling** — 37 rules (36 in confs, 1 A3-conditional
  rule written but deliberately excluded from every conf).
- Host check: **PASS**. Certora compile gate: **PASS** (exit 0).
- Cloud submission: **NOT SUBMITTED — held by precondition** (see below).
- All property verdicts: **NOT RUN.**

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
still exits 0). Whether a prover run tolerates them is **untested** — no
cloud submission has been made.

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
| P3 deposit binding (first submission target) | 9 | NOT RUN |
| P4 authority impotence | 3 | NOT RUN |
| P5 progress + error classification | 2 in conf (+1 A3-conditional rule excluded) | NOT RUN |
| P6 root / frontier integrity | 5 | NOT RUN |

## Submission state

**Held.** The agreed precondition — a completed first cloud submission on
the RedPill suite proving the shared `CERTORAKEY` works — is not met:
`~/workspace/clawd-tee-certora/program/src/certora/RESULTS.md` (unchanged
since 2026-11-17) states no obligation has been submitted yet, and the
parallel RedPill Phase 0 run had not landed one as of this writing.

When the precondition lands, the first Dark submission is
`confs/p3_deposit_binding.conf`, with `CERTORAKEY` loaded into the prover
process environment only. Counterexamples, if any, will be recorded here
verbatim as findings — never spec-fixed away.

## Not claimed

Groth16 soundness, circuit correctness, the trusted setup, and Poseidon
collision resistance (axiom A2, P3 only) are **not** proven by this suite,
even once runs pass. Byte-identity between the local build and the
deployed artifact is likewise **not** claimed (the bytes differ,
cosmetically); per the Artifact delta resolution above, verdicts may be
tied to the deployed program's logic via the proven instruction-stream
equivalence. Full boundary list: `SURVEY.md`.
