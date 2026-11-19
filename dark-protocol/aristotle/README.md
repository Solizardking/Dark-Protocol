# Aristotle pilot — Dark Protocol (SUBMITTED 2026-11-18)

**Status (2026-11-18 ~14:00 EST check): OUT_OF_BUDGET / OUT_OF_CREDITS — run ended without proving or refuting any property.** Project **dark-protocol-pilot**, ID
`4d9bdb7f-7176-492d-9e31-219601fc0f30`, task
`588bc3c0-84e0-4a1a-8f30-60c727b7b5fa` —
https://aristotle.harmonic.fun/projects/4d9bdb7f-7176-492d-9e31-219601fc0f30
Task created 2026-11-18T16:52:08Z, started 16:52:10Z, last updated 18:51:09Z (~1h59m). CLI output: "This run stopped because your organization does not have enough Credits left. Buy credits, then send a follow-up." / "Task stopped: your organization ran out of credits."
Per-property outcomes (from `aristotle show --json`, property_counts: proved 0, refuted 0, in_progress 0, unresolved 7): ALL UNRESOLVED / FAILED with failure_reason OUT_OF_BUDGET —
P0 `dark_protocol.handlers.no_ub_no_panic` unresolved; P1 `dark_protocol.pool.ledger_integrity` unresolved; P2 `dark_protocol.withdraw.gating` unresolved; P3 `dark_protocol.deposit.binding` unresolved; P4 `dark_protocol.authority.impotence` unresolved; P5 `dark_protocol.withdraw.progress_and_errors` unresolved (so Property 5 was NOT proved — no rent-floor preconditions to record as a theorem); P6 `dark_protocol.merkle.root_frontier_integrity` unresolved. No counterexamples, no evidence, no verification boundary statement was produced.
One clarifying question was asked 2026-11-18T16:56:17Z and left UNANSWERED (run ended, so no answer can reach Aristotle now): "Scope check for dark_protocol: besides the two dependencies your spec already treats as contracts (solana-poseidon's sol_poseidon path and the groth16-solana verifier), the handlers also call into other external crates: ark-ff 0.4.2 / ark-bn254 0.4.0 (used by negate_proof_a and zero_chain_20), groth16-solana 0.2.0's is_less_than_bn254_field_size_be (used by is_canonical_field_element), and anchor-lang 0.32.1 (system_program::transfer CPI, Clock::get, error construction). Should those library bodies also be verified, or treated as stated contracts? I'll continue with \"supplied code only\" while waiting, and keep it if no answer arrives." Suggestions were "Supplied code only (faster and cheaper)" vs "Also verify libraries…".
Balance after run (`aristotle balance` at 2026-11-18T19:01:12Z): Available 0 Credits (Free 0, Purchased 0); Granted (active grants) listed as 500 Credits — the 500-credit grant (expires 2026-12-18) was fully consumed by this run. Resuming requires buying credits (dev's call) then `aristotle continue 4d9bdb7f-7176-492d-9e31-219601fc0f30` — NOT done by the watch, per instructions never to resubmit/spend.
Download: `aristotle download` saved `results/4d9bdb7f-7176-492d-9e31-219601fc0f30-aristotle.tar.gz` (56,017 bytes) into `~/workspace/zolana-transplant-merge/dark-protocol/aristotle/results/`, extracted under `results/extracted/`. Contents are only the original project files (Cargo.toml/lock, dark-protocol_spec.md, src/*.rs) plus SepLogic Lean scaffolding (SepLogic/Public.lean, Pure.lean, PublicGeneric.lean) — no summary, proof, or boundary report.
Public page: NOT updated on this failed run, per the dev's 2026-11-18 order — https://darkx402.com/dark-protocol / https://protocol.darkx402.com/ still say "in progress" and need the dev's call on new wording.
Watch cron `aristotle-pilot-watch` removed by this run (watch ends with the run).
Original submission note: SUBMITTED 2026-11-18 ~11:52 EST with the dev's explicit approval, billed to the dev's personal organization. Balance at submit: 500 granted credits, 0 purchased. Login: device-code flow, key "aristotle CLI on htch-runtime" in `~/.config/aristotle/credentials.json`. CLI quirk on this VM: sanitize `NO_PROXY=localhost,127.0.0.1` for every aristotle command, and `aristotle login` needs `< /dev/null` to take the browser device-code path.

## What the pilot is

One scoped Aristotle (Harmonic) formal-verification project over the
`dark-protocol` program crate (`programs/dark-protocol/`): Aristotle
compiles the Rust to a Lean model and returns, per property, **proved /
refuted (with a runnable counterexample) / unresolved**, plus an explicit
verification boundary (what was reached, what was assumed). The decision
brief's analysis is in `../docs/CEREMONY-DECISION-BRIEF.md` (Aristotle
section); the Manifest case study is the model: 28 proved results, 2 real
bugs found, and a proved *progress* property ("a valid swap goes
through") with every error classified by origin.

Aristotle verifies **Rust only** — it says nothing about the Circom
circuit, Groth16 soundness, or the ceremony. Those stay with the audits
and the MPC ceremony.

## The properties (full text: `dark-protocol_spec.md` in this directory)

Stated in Aristotle's style — plain English, in terms of the program's
real functions, types, and fields (`dark_protocol::deposit` /
`::withdraw` / `::initialize` / `::transfer`, `Pool.total_deposited` /
`total_withdrawn`, `Frontier::insert`, `RootHistory::contains`,
`poseidon2`, `recipient_field`, `amount_to_field`, `DarkError::*`):

0. **No UB / no panics** on valid inputs, across all handlers and
   helpers; checked arithmetic only; fixed-array indexing in bounds.
1. **Lamport conservation** — totals always equal the sums of successful
   deposit/withdraw amounts; `total_withdrawn ≤ total_deposited`; vault
   balance ≥ `total_deposited − total_withdrawn`; vault donations can
   never inflate the ledger; `transfer` moves nothing, ever.
2. **Withdraw gating** — the payout CPI is reached only after, in order:
   `amount > 0` → root in `RootHistory` → solvency → `Groth16Verifier::
   verify()` over `[root, nf, recipient_field(recipient), amount]`;
   the `NullifierMarker` (Anchor `init`, seeds `[b"nf", nf]`) is written
   before payment, and any failure rolls its creation back — a rejected
   proof never burns a nullifier.
3. **Deposit binding (NEW-1 as a theorem)** — the inserted leaf is
   exactly `poseidon2(&cm, &amount_to_field(amount))`, computed by the
   program, with the same `amount` value passed to the transfer CPI:
   the bound amount and the lamports actually pulled can never differ.
4. **Authority impotence** — `Pool.authority` is written once at
   `initialize` and authorises nothing; the only vault debit is
   withdraw's proof-gated CPI; no signer-only path moves vault funds.
5. **Withdraw progress + error classification (headline)** — a withdraw
   with a valid proof, a root in the ring, an unspent nullifier, ledger
   solvency, and the rent-floor conditions (vault stays rent-exempt
   after payment; recipient funded to rent) **goes through**, and every
   withdraw error is classified by origin (caller input / ledger state /
   verifier / account validation / runtime), with
   `DarkError::ArithmeticOverflow` proved unreachable or refuted by
   counterexample. This is the property that would convert the
   POSEIDON-COST.md §8 rent-floor finding into a theorem with exact
   preconditions.
6. **Root-history & frontier integrity** — the ring only ever contains
   roots the program itself produced; `current_root` after n deposits
   equals a from-scratch evaluation of the depth-20 tree over the bound
   leaves; roots age out after exactly 32 pushes.

The spec states the external contracts honestly up front: `poseidon2`
(the `sol_poseidon` syscall) is treated as a deterministic function that
errors only on non-canonical inputs, and `Groth16Verifier::verify()`
(the alt_bn128 pairing path) as an oracle that accepts only valid
proofs for the stated public inputs. Where a property needs more
(collision resistance, Property 3), the spec names it as an assumption.

## Success criteria

- Every property **proved**, or **refuted with a counterexample we can
  act on**. Unresolved properties are reported as unresolved — not
  rounded up to success.
- Property 5 is the headline: proved (with its exact rent-floor
  preconditions) or refuted with a concrete blocking case.
- The returned **verification boundary** is recorded in our docs
  verbatim — which functions were reached, which external contracts
  were assumed — the same way Manifest stated theirs.

## Known limits (from Aristotle's docs, 2026-11-18)

- Modelled Solana syscalls per the docs: sysvars, SHA-256, PDAs,
  curve-point validation, CPI. **`sol_poseidon` and `alt_bn128` are NOT
  listed** — our two most critical calls will likely be assumed
  contracts or boundary-limited (pre-flight questions drafted in
  `HARMONIC-QUESTIONS.draft.md`).
- **No compute-unit, termination, or liveness reasoning** — the entire
  Poseidon-cost failure class is invisible to it. CU safety remains
  measurement + rehearsal.
- Single compiler: rustc 1.97.0-nightly (2026-05-01); Anza-fork / sBPF
  layout support is follow-up work. We build with platform-tools
  rustc 1.95 under Anchor 0.32.1 — expect proofs about a neighbouring
  build, not our exact artefact.
- The Rust→Lean embedding is proprietary; proofs are machine-checked
  but the translation is Harmonic's closed code. Code is uploaded to
  Harmonic's service (private/on-prem exists at custom tiers).
- Runs take minutes to days; consumption-based credits; per-run pricing
  is **not publicly itemised**.

## The submission bundle

| | |
|---|---|
| File | `dark-protocol-aristotle-bundle.tar.gz` (this directory) |
| sha256 | `385995e11ba3cf791fe43839a5d556b23e487413cda241e23100af406a913acd` |
| Size | 49,396 bytes |
| Contents | 10 files: `dark-protocol/Cargo.toml` (the crate's own), `dark-protocol/Cargo.lock` (the workspace lockfile — the crate has no lockfile of its own; all dependencies are crates.io), `dark-protocol/dark-protocol_spec.md` (at the crate root, next to `Cargo.toml`), `dark-protocol/src/{lib, merkle, poseidon, poseidon_params, vk, zero_chain, errors}.rs` |
| Excluded | `target/`, `.git`, `node_modules`, the crate's `examples/`, `README.md`, `FINDINGS-MAP.md`, and everything else in the repo. **No keypair or secret material of any kind; `~/workspace/deploy-keys/` is not in the bundle and never entered the staging directory.** |

**Secret scan (run on the staged file list before tarring):**
filename scan for `keypair|secret|.env|id_rsa|.pem|deploy|mnemonic` —
clean. Content scan for PEM blocks, `deploy-keys`, `mnemonic`,
`seed phrase`, `PRIVATE KEY`, `api_key=` — the only hits are the word
"keypair" in `src/lib.rs` doc comments (lines 55–58), which state that
the program keypair is stored *outside* the tree and was never
committed. That is a comment naming a directory path; there are no key
bytes, no seed material, and no credentials anywhere in the bundle.
(`vk.rs`, `zero_chain.rs`, and `poseidon_params.rs` contain public
verifying-key / hash constants — public by design.)

**Vendor-tooling confirmation:** `aristotle submit … --dry-run`
(which sends nothing) was run against the staged folder and listed
exactly the same 10 files, 49.2 KB: *"Dry run: would upload 10 files
(49.2 KB)."*

## Access path — established as far as it goes without the dev

- **CLI installed and verified** in a scratch venv on the root overlay:
  `/aristotle-scratch/venv` (Python 3.12.3), `pip install
  "aristotlelib>=3"` → **aristotlelib 3.4.0**; `aristotle --version`
  prints `aristotlelib 3.4.0`, matching the docs' setup check. The
  official alternatives are `uv tool install "aristotlelib>=3"`
  (global) or the same pip install in any venv. (The venv lives on the
  root overlay: if the VM is replaced, reinstall — one command, above.)
- **Sign-in is the step that needs the dev.** `aristotle login` (or the
  first `aristotle submit`) prints an approval-page address and a code;
  a human approves it in a browser, signing in / creating the Aristotle
  account and choosing which **organization** the machine key belongs
  to. The CLI then stores a machine-named API key in
  `~/.config/aristotle/credentials.json` (revocable in the web UI under
  API keys). **No account exists yet**: `~/.config/aristotle/` does not
  exist on this VM, and nothing has been logged in.
- **MCP alternative:** add `https://aristotle.harmonic.fun/mcp` to an
  MCP-capable assistant and sign in with OAuth when asked (no key to
  copy). Same account, same disclosure — not a way around the decision.
- **Upload behaviour (docs):** ≤ 100 MB compressed (ours is 49 KB);
  the CLI keeps credentials (`.env`, keys, `.ssh`), `.git`, and
  `.gitignore`-excluded files out of uploads from a git checkout. Our
  bundle is hand-built and dry-run-verified, so its contents are known
  exactly regardless.
- **Billing (docs):** the first run asks which organization pays; runs
  billed to it then start unasked for 90 days (unless credits run low).
  Sign-up includes **500 free credits**. Per-run consumption is not
  published; one public report describes ~$500 of credit burning on a
  large C memory-safety job, so watch the balance (`aristotle balance`)
  after the first run. Runs may ask clarifying questions with a
  15-minute answer window (web app or `aristotle questions`);
  `--no-questions` disables that.

## Ready-to-fire checklist (for the dev)

1. **Read** `dark-protocol_spec.md` and the bundle listing above.
   Confirm you accept disclosing this source to Harmonic.
2. **Decide** whether to send `HARMONIC-QUESTIONS.draft.md` first and
   wait for the `sol_poseidon` / alt_bn128 answers, or to fire the
   pilot on the free credits and read the boundary from the results.
   (Prep recommendation: fire — the boundary statement in the run
   output answers the same question empirically, and the questions can
   go in parallel.)
3. **Create the account** at aristotle.harmonic.fun (sign-up; 500 free
   credits).
4. **Log in from this VM** (one command, then approve the code in your
   browser and pick the paying organization):
   `/aristotle-scratch/venv/bin/aristotle login`
   (If the venv is gone: `python3 -m venv /aristotle-scratch/venv &&
   /aristotle-scratch/venv/bin/pip install "aristotlelib>=3"` first.)
5. **Re-run the dry run** to reconfirm the upload set:
   `aristotle submit "Verify the properties stated in
   dark-protocol_spec.md" --project-dir
   /aristotle-scratch/bundle/dark-protocol --dry-run`
   (If the staging folder is gone, extract the bundle tar.gz — its
   top-level `dark-protocol/` folder is the `--project-dir`.)
6. **Submit** (this is the disclosure + first credit spend):
   `aristotle submit "Verify the properties stated in
   dark-protocol_spec.md. The spec file is at the project root; its
   stated contracts for sol_poseidon and the Groth16 verifier are part
   of the properties." --project-dir
   /aristotle-scratch/bundle/dark-protocol --name dark-protocol-pilot`
   Add `--wait` to follow it in the terminal, or follow it in the web
   app. Expect minutes to days.
7. **After the run:** `aristotle download <project-id>` for the result
   archive; record the summary + verification boundary in
   `../docs/` and update POSEIDON-COST.md §8 if Property 5 lands.
   Check `aristotle balance` to learn what a run of our size actually
   costs before any follow-up run.
