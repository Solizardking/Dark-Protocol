# Certora CVLR specifications — `dark-protocol` (v2)

Formal-verification specs for the Dark Protocol shielded SOL pool
(`2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL`, devnet), written in
CVLR (Rust) against the Certora Solana Prover (SBF).

The properties are the seven of the Aristotle verification spec
(`dark-protocol/aristotle/dark-protocol_spec.md`, Properties 0–6) —
the run that ended OUT_OF_BUDGET on 2026-11-18 with zero verdicts —
restated for Certora. Property numbering is preserved 1:1
(`specs/p0_*.rs` … `specs/p6_*.rs`).

- `SURVEY.md` — where each property is enforced in the current code,
  the verification boundary, the modelling conventions, and the
  explicit not-claimed list (including the v1 program's exclusion).
- `RESULTS.md` — per-property status tied to a base commit and a
  program build hash, the assumptions behind the supported claim.
- `specs/` — the CVLR rules, the harness that drives the real
  handlers, and `axioms.rs` (assumptions A1–A6).
- `confs/` — prover configurations (sources mode + pre-built
  fallback). `p3_deposit_binding.conf` is the first submission
  target.
- `envs/` — `cvlr_inlining.txt` / `cvlr_summaries.txt` (Certora
  spec-template baselines plus project entries for this crate).

## Layout note

Everything here is compiled **only** under the cargo feature
`certora` (the crate root gates `pub mod certora;`, and the crate's
`Cargo.toml` makes `cvlr` / `cvlr-solana` optional dependencies of
that feature; the feature also implies `no-entrypoint`). Production
builds do not include any of it, and the feature-off SBF artifact is
hash-checked against the canonical build in `RESULTS.md`.

One rule is deliberately in no conf:
`rule_p5_progress_under_oracle_contract` (property 5's progress
half) is A3-conditional — see `specs/p5_progress.rs` and
`SURVEY.md` §P5.

## Toolchain

| Tool | Version used here | Notes |
| --- | --- | --- |
| rustc / cargo (host) | 1.89.0 | Via `RUSTUP_TOOLCHAIN=1.89.0`. |
| Solana platform-tools (SBF build) | v1.58 via `cargo-build-sbf --tools-version v1.58` | Produces the canonical artifact (hash in `RESULTS.md`). |
| Solana platform-tools (Certora) | v1.53 (`--cargo_tools_version v1.53`) | Latest Certora-published set; v1.58 was never published to Certora's registry. Installed locally for the gate. |
| cvlr / cvlr-solana | 0.6 / 0.5 (crates.io) | Optional deps of the `certora` feature. |
| certora-cli | 8.20.3 | `pip install certora-cli` (provides `certoraSolanaProver`); on this VM it lives in the clawd-tee worktree's `.certora-venv`. |
| CERTORAKEY | required for cloud runs | Loaded into the prover process environment only; never committed, never logged. |

## Local checks that run without a key

From the workspace root (`dark-protocol/`):

```bash
# 1. The program still builds to SBF, unchanged, without the feature.
cd programs/dark-protocol  # (build runs from the workspace root too)
cargo build-sbf --tools-version v1.58
sha256sum <target>/deploy/dark_protocol.so
# expected: the canonical rehearsal artifact recorded in RESULTS.md

# 2. The spec crate compiles (native check of specs + harness + handlers).
cargo check -p dark-protocol --features certora
```

And the compile gate proper, from the crate root
(`programs/dark-protocol/`):

```bash
cargo certora-sbf --tools-version v1.53 --features certora
```

## Running the prover

1. Export a key: `export CERTORAKEY=<key>` (do not commit it).
2. From the **crate root** (`programs/dark-protocol/`), run one
   property at a time (P3 first) or the full suite:

```bash
certoraSolanaProver src/certora/confs/p3_deposit_binding.conf   # property 3 (NEW-1) — first target
certoraSolanaProver src/certora/confs/p0_no_ub.conf             # property 0
certoraSolanaProver src/certora/confs/p1_conservation.conf      # property 1
certoraSolanaProver src/certora/confs/p2_withdraw_gating.conf   # property 2
certoraSolanaProver src/certora/confs/p4_authority.conf         # property 4
certoraSolanaProver src/certora/confs/p5_progress.conf          # property 5 (classification half)
certoraSolanaProver src/certora/confs/p6_root_history.conf      # property 6
certoraSolanaProver src/certora/confs/run.conf                  # all conf'd rules
```

   Or a single rule: add `--rule <rule_name>`. Results appear at
   `https://prover.certora.com` (job link printed by the CLI).
   Record the job links in `RESULTS.md` next to each property.

### Fallback

`confs/prebuilt.conf` verifies the locally built `.so` directly —
use it if the cloud's v1.53 sources build cannot handle this Anchor
workspace. It ties the run to the exact shipped artifact (hash in
`RESULTS.md`).
