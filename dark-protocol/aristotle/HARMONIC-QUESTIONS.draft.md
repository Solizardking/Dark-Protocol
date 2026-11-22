# Pre-flight questions for Harmonic — DRAFT, NOT SENT

**Status:** draft only (prepared 2026-11-18). Nothing has been sent to
Harmonic. Sending is the dev's call, alongside the pilot submission
decision (see `README.md` in this directory).

**Context for the recipient:** we are evaluating Aristotle for a scoped
pilot on one Solana program: an Anchor 0.32.1 shielded-pool program
(Groth16-verified withdrawals over BN254), ~1,760 lines of Rust in the
program crate, all dependencies from crates.io with a pinned lockfile.
Properties are drafted (conservation, withdraw gating, deposit binding,
authority impotence, withdraw progress + error classification,
root-history integrity). The questions below decide how much of the
result we can rely on.

1. **`sol_poseidon` modelling.** Since a compute-cost fix, all of the
   program's hashing goes through the runtime's native `sol_poseidon`
   syscall (via the `solana-poseidon` crate, Bn254 x^5, big-endian).
   Your Rust docs list the modelled Solana syscalls as sysvars,
   SHA-256, program-derived addresses, curve-point validation, and CPI —
   `sol_poseidon` is not among them. Is it (a) modelled, (b) treated as
   an assumed contract, or (c) currently unhandleable (functions
   reaching it reported as unverifiable)? If (b), can we supply the
   contract ourselves — deterministic `[u8; 32]² → [u8; 32]`, erroring
   only on non-canonical inputs — and will results depending on it be
   marked as resting on that assumption in the verification boundary?

2. **alt_bn128 syscalls / the Groth16 pairing path.** Withdraw
   verification uses the `groth16-solana` crate, whose pairing check
   runs on the runtime's alt_bn128 addition / multiplication / pairing
   syscalls. Same question as (1): modelled, assumed, or
   unhandleable? Our spec proposes treating `Groth16Verifier::verify()`
   as an oracle that accepts only valid proofs for the stated public
   inputs and verifying key, and proving the gating/order/atomicity
   *around* it. Is that a shape your pipeline supports cleanly, and how
   is it surfaced in the summary — as proved-under-assumption, or as
   unresolved?

3. **Anchor 0.32 support.** The program is Anchor-based: `#[program]`
   handlers, `#[derive(Accounts)]` validation, `init` / `seeds` /
   `bump` constraints doing security-critical work (our double-spend
   control *is* an Anchor `init` on a PDA). Does the embedding expand
   and reason about Anchor's derive-generated validation code, or does
   verification start at the handler body with account validation taken
   as a precondition? Either is workable for us; we need to know which
   claims the results will actually cover.

4. **sBPF target and toolchain skew.** Your docs state a single
   supported compiler (rustc 1.97.0-nightly, 2026-05-01) with Anza-fork
   and sBPF-layout support as follow-up work. We build with Solana
   platform-tools (rustc 1.95, the Anza fork) for the sBPF target. What
   exactly is a result proved *about* in that situation — our source
   under your compiler's semantics? Is sBPF/Anza support on a public
   timeline? (The Manifest case study suggests the gap is accepted
   practice; we want it stated for our program specifically.)

5. **Expected credit cost at our size.** One Anchor program, ~1,760
   lines, seven properties (one baseline no-UB/no-panic, six functional
   ones, several quantified over arbitrary instruction sequences). Can
   you give a consumption range for a first run of that shape? Is the
   500-credit sign-up grant plausibly enough for a scoped first run, or
   should we budget a top-up before submitting? Do refuted and
   unresolved properties consume the same as proved ones? Is there
   volume or fixed-fee pricing for follow-up runs on the same project?

6. **Publishing results.** May we publish the run summary, the property
   statements and their statuses, the public Lean specifications, and
   any counterexamples in our own public repository and documentation?
   Any required attribution or prohibited content?

7. **Code privacy and retention.** Our program source is not yet
   public. How long are uploaded projects retained, what does project
   deletion remove server-side, and who at Harmonic can access uploaded
   source? Are private-cloud or on-prem deployments available, at what
   tier/pricing? Is an NDA available before upload?

8. **Clarifying questions during a run.** Docs describe questions with
   a 15-minute answer window. For a run that may take days, what is
   lost if questions go unanswered or are disabled (`--no-questions`)?
   Can questions be answered asynchronously on the project page after
   the window, with the run resuming from them?

9. **Dependency handling.** All dependencies are crates.io (anchor-lang
   0.32.1, groth16-solana 0.2.0, solana-poseidon 2.3.13, light-poseidon
   0.2.0, ark-* 0.4.x) with a pinned workspace `Cargo.lock`. Are any of
   these known to be problematic for the embedding (e.g. heavy
   proc-macro or build-script use)? Should the upload include the
   lockfile even though it is a workspace lock rather than a crate
   lock?
