# Dark Protocol — MPC Ceremony Decision Brief

**Date:** 2026-11-18 · **Status:** DECISION NEEDED (dev) · **Scope:** production Groth16
trusted setup for the withdraw circuit, the last cryptographic gate before a mainnet
decision. Devnet v1 is complete and rehearsed (see POSEIDON-COST.md / W5-REHEARSAL.md);
nothing in this brief touches mainnet, and the mainnet deploy decision stays separate.

## Frozen inputs (verified 2026-11-18)

| Item | Value |
|---|---|
| Circuit | `withdraw.circom`, **13,162 constraints**, 4 public inputs, BN254 / Groth16 |
| r1cs sha256 | `a446c630044aa7ea5472762e15824d80ef9ba52238a189b6b27149f61d75cab4` |
| Current ptau | local, **single-contributor**, 2^14 — sha256 `e7530df4bded1187e5451d6bbf5bf06001d726fdd93a3cd5833d1548cdd28b00` — DEV ONLY |
| Current zkey sha256 | `8401d730518f13a367b69f2a5aa5cb7828d755ee5e022ed51b3d840eaf5df5e4` (dev keys, in the live devnet program) |
| Ceremony kit | `contribute.sh` / `verify-transcript.sh` / `finalize.sh` / `export_vk.js` + RUNBOOK.md — built and rehearsed end-to-end 2026-11-17, **but it lives only in the donor tree** (`dark-defi-rewrite/zk/ceremony/`); porting it into this tree is prep step P0 below |

## The one fact that decides everything

Groth16 security needs **at least one honest, entropy-destroying contributor in
phase 1 AND at least one in phase 2**. The phases are independent: **phase 2 cannot
repair a compromised phase 1.** The tree's current phase 1 was one local contributor
(its entropy string is literally in `zk/keys/ceremony_redo.sh`), so today's keys are
dev keys no matter how good a phase 2 we run on top of them. The phase-1 choice is
therefore the real decision; phase 2 procedure is already written and rehearsed.

---

## Decision 1 — Phase 1: adopt a public perpetual ptau, or redo phase 1 ourselves?

### Option A — Adopt the Hermez / Perpetual Powers of Tau file (RECOMMENDED)

**What it is.** The `powersOfTau28_hez_final_<power>.ptau` artefacts: Perpetual
Powers of Tau contributions **1–54 plus a public randomness beacon**, prepared per
power by the Hermez (Polygon) team and published with BLAKE2b hashes in the snarkjs
README. This is the phase 1 the Circom ecosystem actually runs on — Risc0's Groth16
verifier (final_23), Tacit's transact circuit (final_16), Worldcoin Semaphore's
setup tooling, and hundreds of smaller projects all build on these exact files.

**Trust profile.** 54 independent contributions + a beacon: phase 1 is safe unless
*every one* of those 54 participants kept their toxic waste *and* colluded — a
strictly stronger public claim than anything we can assemble ourselves in weeks.
The wider PPOT chain later forked after contribution 0058 and its coordinating repo
was archived (Aug 2026); the Hermez branch is the pre-fork 1–54 segment sealed with
a beacon, i.e. a frozen, widely mirrored artefact — cite it as "Hermez powers of
tau (PPOT 1–54 + beacon)", not loosely as "PPOT".

**Verification (how we know we have the real file).**
1. Download from **two independent mirrors** (the `circom.info` links in the snarkjs
   README; the Hermez S3 bucket) **on a normal network** — this VM's egress proxy
   refuses the S3 bucket (HEAD returned 403 from here on 2026-11-18, same as the
   runbook recorded), so the download is a Mac-side step, like the keypair rotations.
2. BLAKE2b-512 of the file must equal the README-published hash (table below).
3. `snarkjs powersoftau verify` must print the full 54-contribution transcript + OK.
4. Record the hash in the ceremony transcript header and in this repo's README
   register before the first phase-2 contribution.

**Costs.** Hours, not weeks. No phase-1 coordination, no phase-1 contributors to
recruit, no phase-1 transcript to defend. All ceremony effort goes to phase 2,
where our circuit-specific risk actually lives.

**Risks / honest downsides.** We inherit an external artefact (sovereignty cost —
mitigated by hash-pinning from multiple sources and by the 54-contributor record);
if the file were ever credibly impugned, production keys would need a full redo
(phase 1 + phase 2 + VK splice + redeploy). No such impugnment exists.

### Option B — Redo phase 1 as our own multi-party ceremony

**What it is.** Run `powersoftau new bn128 <power>` ourselves and pass the ptau
through our own sequential contributors with the same discipline as phase 2
(per-hop verify, published transcript, pre-announced beacon, `prepare phase2`).

**Trust profile.** Cryptographically sufficient with as few as one honest
contributor who destroys their entropy — identical math to Option A. The gap is
**public credibility**: a self-run phase 1 with, say, 5–10 contributors asks the
world to trust a much smaller, self-selected set, and every participant is someone
we recruited. For a privacy protocol whose whole pitch is "don't trust us", that
weaker public story is a real cost, not a cosmetic one.

**Costs.** A second full ceremony before the first one starts: realistically
**2–4 weeks** of coordination (recruiting, sequential hops with 24–48 h per-hop
SLAs, transcript publication), heavier files at each hop, and a second invalidation
surface. Entropy footguns multiply — snarkjs's non-interactive `-e` flag with a
literal string produces a contribution with effectively no secret; the runbook's
interactive-only rule has to be enforced on twice as many people.

**Benefits.** Full sovereignty: no external artefact anywhere in the stack, exact
sizing, our own transcript. This is the only option that satisfies a strict
"no inherited trust" doctrine.

### What is NOT an option

- **Hybrid / switch later.** Phase 2 binds to the phase-1 file. Changing ptau after
  phase 2 means a new phase 2, a new VK, a program upgrade, and a fresh devnet
  rehearsal. Decide once.
- **Phase 2 on the current local ptau.** A rehearsal by definition (runbook step 0).
  Fine for practice, worthless for production, and it must be labelled rehearsal.

### Recommendation

**Option A.** The 54-contributor public record is stronger than a self-run phase 1
we could credibly assemble, it is the ecosystem-standard artefact (auditors and
integrators recognise it on sight), and it moves the schedule by weeks. Sovereignty
is preserved where it can actually be enforced: hash-pinning, transcript
publication, and our own phase 2. If the dev's doctrine call is "no inherited trust,
full stop", Option B is fully specified above and the kit supports it — but it
should be chosen knowing it buys sovereignty with time and a weaker public
credibility story, not with stronger cryptography.

---

## Decision 2 — Which power? (only relevant under Option A; sizes Option B too)

| Power | Max constraints | Headroom vs withdraw (13,162) | Verdict |
|---|---|---|---|
| 2^14 | 16,384 | 1.24× — fits today, nothing else | The runbook's literal suggestion; too tight |
| **2^15** | **32,768** | **2.5×** | **RECOMMENDED** |
| 2^16 | 65,536 | 5× | Acceptable one-and-done alternative |

Phase 1 is bought **once and reused for every future circuit**; phase 2 is per
circuit. The W8 transfer circuit (spec: `docs/w8/transfer-circuit.md`) moves two
notes and will plausibly land near 2× the withdraw circuit — over a 2^14 ceiling.
Adopting 2^14 today would force a second phase-1 decision (and, for consistency,
a withdraw redo) the day transfer is built. 2^15 covers withdraw + the transfer
estimate; 2^16 covers any realistic v1/v2 circuit at the cost of a ~2× larger
download and slower setup/verify. Hashes (BLAKE2b-512, from the snarkjs README):

- final_15: `982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e`
- final_16: `6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125`

---

## Contributor plan (phase 2 — runs under either phase-1 decision)

**Security bar:** ≥1 honest contributor who destroys their entropy. **Credibility
bar (our target): 5 contributors**, minimum acceptable 3, drawn from at least 3
independent organisations/households, on their own machines.

| Slot | Who | Notes |
|---|---|---|
| Coordinator | The dev (or Muse under the dev's direction) | Logistics only: prepares `withdraw_0000.zkey` from the adopted ptau, forwards hops, publishes the transcript. **Does not contribute** — clean separation beats one more hop |
| C1 | The dev, on his own Mac, as a private individual | First hop; also proves the contributor instructions work for a non-coordinator |
| C2 | An independent Solana/ZK developer (recruit from the dev's network) | Must not be a Muse agent or a dev-controlled machine |
| C3 | An external security researcher / auditor | The credibility anchor; ideally someone who will also re-verify the transcript publicly |
| C4 | A second independent developer, different org than C2/C3 | |
| C5 | Optional public community contributor | Open-call slot if C1–C4 land quickly; more hops are cheap, each is one evening |
| Beacon | **drand mainnet** (recommended) — a round number pre-announced before contributions open, whose output lands after they close; 2^10 iterations per the runbook. Alternative: hash of a named future Bitcoin block | Not a person; nobody can predict or grind it at announcement time |
| Verifiers | ≥2 people who did **not** contribute | Run `verify-transcript.sh` independently and say so publicly |

**Per-contributor rules (from the runbook, non-negotiable):** verify the incoming
zkey's sha256 against the published transcript and `zkey verify` → `ZKey Ok!`
*before* contributing; entropy interactive-only (never `-e`, never
`CEREMONY_ENTROPY` outside rehearsal), ≥ ~30 characters of real randomness
(diceware / hardware), existing nowhere else; publish name + contribution hash +
output sha256 immediately; destroy the entropy and say what you did to destroy it.
The coordinator confirms `ZKey Ok!` after every hop before the next starts.

**Schedule (from decision day, assuming Option A):**

- **Day 0** — Dev decides phase 1 + power. Prep P0 lands (below). Circuit freeze
  confirmed: r1cs hash above is the ceremony's circuit; *any* circuit change after
  this restarts the ceremony clock.
- **Day 1** — ptau downloaded (Mac), hash-verified from two mirrors, `powersoftau
  verify` transcript captured; transcript repo/page opened; beacon round
  pre-announced; contributor invitations out.
- **Days 2–9** — Sequential hops, 24–48 h SLA each, transcript updated per hop.
- **Beacon day** — Contributions close; drand round lands; `finalize.sh` runs;
  full-transcript verification by coordinator + ≥2 independent verifiers.
- **+2 days** — Publication: complete transcript (ptau provenance + hash, r1cs
  hash, every contribution hash in order, beacon source/value/exponent, final zkey
  + VK hashes).
- **Then, gated separately** — VK splice into `vk.rs` via the tree's generators
  (never hand-typed), acceptance gate on the spliced tree (**program 20/20,
  client 34/34, ZK 13/13** — the merged tree's current counts), and a **devnet
  re-rehearsal with the production VK** (upgrade the devnet program, repeat
  deposit → withdraw → replay-reject) before any mainnet conversation. A production
  VK that has never run on devnet does not go to mainnet.

**Invalidation (any one kills the ceremony; abort, publish the reason, restart
from step 0):** a hop fails `ZKey Ok!`; a hop adds ≠1 contribution or rewrites
history; a published hash mismatches the chain; the beacon applied is not the
pre-announced value; the ptau/r1cs differ from the Day-0 record; enough entropies
leak that the honest-contributor threshold is in doubt.

**Prep step P0 (before Day 0, on the dev's go):** port the ceremony kit from the
donor tree into `dark-protocol/zk/ceremony/` in this tree, re-point its defaults
at the adopted ptau, update the acceptance-gate counts to the merged tree's
(20/20 / 34/34 / 13/13), and re-run the fake-contribution rehearsal against this
tree's r1cs so the production run is the kit's *second* execution here, not its
first.

---

## Aristotle (Harmonic) — what the Manifest case study shows, and whether Dark should use it

*Requested look-into, 2026-11-18. Sources: the Manifest case study
(harmonic.fun/aristotle/case-studies/manifest), Aristotle's Rust verification docs
(aristotle.harmonic.fun/docs/software/rust), and launch coverage of the
2026-11-16 Rust release.*

### What Manifest actually got

Manifest is an open-source Solana order book. Aristotle — Harmonic's agentic
theorem prover, which compiles Rust deterministically into a Lean formal model
(MIR-level, separation logic) and machine-checks proofs — produced **28 proved
results across 8 areas**, and **found 2 real bugs**, both fixed:

1. **A rounding overshoot in the quote/fill path:** at price 1.5 a complete fill
   could subtract 2 quote atoms when only 1 remained, returning an arithmetic
   error *after the target had already been met*. Fixed (stop when the fill meets
   or exceeds the target) and the corrected behaviour proved, including that exact
   example.
2. **A dead-but-failable computation on the cancel-global path:** a quote
   conversion whose result was never used could fail before the order was removed.
   Fixed, with the bounds on accepted bids proved.

The headline result class is **trading progress**: not just "no loss of funds",
but a proof that *a valid swap actually goes through* under explicit conditions
(liquidity, funding, in-range amounts, token program behaving) — plus **error
classification**: every error a swap can return traced to its origin, showing none
originate in Manifest's own matching/setup code. Also proved: order-book tree
integrity under insert/remove, custody/backing and non-repeatable refunds,
cancellation authorisation, matching rules, reverse-order ranges, quote/matching
agreement. Proof scope was honest about its edges: the **real Rust, unchanged**;
any finite sequence of operations; unsafe code included; **token/system programs
assumed, not proved; no compute-unit bound**.

### How Aristotle is used (mechanics)

- Submit a Cargo project + properties **in plain English** (prompt or a spec
  `.md` beside the code) via web app, **MCP server** (`aristotle.harmonic.fun/mcp`),
  CLI, or Python SDK (`aristotlelib`). No local Rust toolchain needed.
- Returns per-property **proved / refuted (with a runnable counterexample) /
  unresolved**, a summary, and an explicit **verification boundary**: which
  functions were reached, and every assumption (external-crate contracts, runtime
  contracts) a result rests on.
- Runs take **minutes to days**; consumption-based credits (sign-up includes 500
  free credits; per-run pricing is not publicly itemised — one public report has
  a $500 credit burning through on a large C memory-safety job, so budget is a real
  question to settle before a big submission). Rust support launched 2026-11-16
  with a **Solana Foundation partnership**; a second Solana case study (Project 0,
  a prime broker) proved book consistency across deposits/withdrawals/borrows/
  repayments/liquidations in any order.

### Fit for Dark Protocol — what it could prove for us

Aristotle verifies **Rust, not circuits**: it says nothing about the Circom
circuit, Groth16 soundness, or the ceremony (those stay with the existing audits
+ this brief's ceremony). What it *could* add is machine-checked proof of the
on-chain program's state machine — exactly the layer where our audit history
(NEW-1, the rent floor) actually bit. A scoped property list, Manifest-style:

1. **Conservation:** across any sequence of instructions, vault lamports track
   `totalDeposited − totalWithdrawn` plus the documented rent buffer — no
   instruction creates or destroys lamports.
2. **Withdraw gating:** lamports leave the vault only in a withdraw whose proof
   verified, whose root is in the root history, and whose nullifier marker was
   freshly initialised — and the marker is initialised *before* payment.
3. **Deposit binding:** the leaf inserted is always the program-computed
   `Poseidon(cm, amount)` with `amount` equal to the lamports actually received
   (the NEW-1 property, stated as a theorem instead of a regression test).
4. **Authority impotence:** no instruction lets the pool authority (or any
   signer qua signer) move vault funds.
5. **Progress / liveness (the Manifest headline, and our known §8 wound):** a
   withdraw with a valid proof, known root, unspent nullifier **goes through**
   provided the vault stays above rent-exemption after payment and the recipient
   is funded to rent — i.e. prove the rent-floor conditions *are* the only
   blockers, and get every withdraw error classified by origin.
6. **Root-history integrity:** the ring buffer only ever contains roots the
   program itself produced; deposits update root/frontier consistently.

### Limits and open questions (must be answered before relying on it)

- **Syscall coverage.** The docs list modelled Solana syscalls: sysvars, SHA-256,
  PDAs, curve-point validation, CPI. Our program's two most security-critical
  calls are **not on that list**: `sol_poseidon` (all hashing since the
  Poseidon-cost fix) and the **alt_bn128 syscalls** under groth16-solana's
  pairing check. Those functions would likely be treated as assumed contracts or
  reported unhandleable — meaning property 2 above might be proved about
  everything *around* the pairing check, with the check itself assumed. That is
  still useful, but it is the first question to put to Harmonic, in writing.
- **No CU, termination, or liveness reasoning** (their stated limits): the entire
  Poseidon-cost failure class is invisible to it. Our CU safety remains
  measurement + rehearsal, as now.
- **Toolchain skew.** Aristotle currently verifies with a single compiler
  (rustc 1.97.0-nightly, 2026-05-01) and notes Anza-fork / sBPF-layout support as
  follow-up work; we build with platform-tools rustc 1.95 under Anchor 0.32.1.
  Expect some properties to be proved about a neighbouring build, not our exact
  artefact — the Manifest team accepted the same class of gap.
- **Trust model.** The Lean embedding is proprietary: proofs are machine-checked,
  but the Rust→Lean translation is Harmonic's closed code, and code is uploaded to
  Harmonic's service (on-prem/private deployment exists at custom tiers). This is
  a *different* assurance shape from the Certora work already underway in another
  track — complementary, not a replacement. Note also our program source is not
  yet public; uploading it to a third-party service is a disclosure decision for
  the dev, even under NDA-ish terms.
- **Cost unknown.** No public per-property price; get a quote / burn the 500 free
  credits on a scoped pilot and measure before committing.

### Recommendation on Aristotle

**Run a scoped pilot, in parallel with the ceremony — never blocking it.**
One project: `programs/dark-protocol/src` + a spec file with properties 1–6
above. Budget: the free credits first. Success = every property proved, or
refuted with a counterexample we can act on; the rent-floor progress property
(#5) is the one to watch — a proof there converts POSEIDON-COST.md §8 from a
documented finding into a theorem with exact preconditions. Pre-flight questions
to Harmonic: sol_poseidon / alt_bn128 modelling, Anchor 0.32 support, sBPF
target status, and per-run pricing at our size (~one Anchor program). If the
syscall answer is "assumed, not modelled", the pilot is still worth it for
properties 1, 3, 4, and 6 — with the boundary stated in our docs, the same way
Manifest stated theirs.

---

## Decisions needed from the dev

1. **Phase 1:** Option A (adopt Hermez — recommended) or Option B (own phase 1)?
2. **Power:** 2^15 (recommended) or 2^16?
3. **Contributors:** target 5 as planned; who recruits C2 (independent dev) and
   C3 (auditor)? Any names to invite first?
4. **Beacon:** drand (recommended) or a named Bitcoin block?
5. **Aristotle pilot:** go / no-go, in parallel with the ceremony?
6. **P0 prep:** port the ceremony kit into this tree + re-rehearse here (needed
   under every option) — go?
