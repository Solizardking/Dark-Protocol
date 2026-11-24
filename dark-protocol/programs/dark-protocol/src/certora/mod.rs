//! Certora CVLR formal-verification suite for the `dark-protocol` program
//! (program id `2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL`, devnet).
//!
//! This module is compiled ONLY under the `certora` feature
//! (`cargo check -p dark-protocol --features certora`). It is never part
//! of a production build: the feature implies `no-entrypoint` and the
//! deployed `.so` is built without it, so nothing here changes program
//! behavior.
//!
//! The properties specified here are the seven properties of the
//! Aristotle verification spec (`dark-protocol/aristotle/
//! dark-protocol_spec.md`, properties 0–6), restated as CVLR rules. The
//! Aristotle pilot run (2026-11-18) ended OUT_OF_BUDGET with zero
//! verdicts; this suite is the same property set on the Certora Solana
//! Prover. Rule files are numbered after the spec: `p0_` … `p6_`.
//!
//! Layout (following Certora's Solana spec template, and the in-house
//! pattern of the `solana-redpill-verifier` suite in clawd-tee):
//!   - `specs/`   — the rules, one file per property, plus the harness
//!                  that drives the real instruction handlers through
//!                  manually constructed Anchor account structs (see
//!                  `specs/harness.rs` for the modelling conventions).
//!   - `confs/`   — certoraSolanaProver configuration files.
//!   - `envs/`    — `cvlr_inlining.txt` / `cvlr_summaries.txt` baselines
//!                  vendored from Certora's solana-spec-template, with a
//!                  project-specific section appended.
//!   - `mocks/`   — reserved for Prover models of heavy dependencies.
//!
//! Documents: `SURVEY.md` (where each property is enforced today, the
//! verification boundary, and what is NOT claimed), `RESULTS.md`
//! (per-property proof status), `README.md` (runbook).
pub mod specs;
