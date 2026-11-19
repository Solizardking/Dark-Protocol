# Formal-Verification Candidate Inventory — the whole fleet

**Date:** 2026-11-18 · **Status:** prep only. Nothing submitted, no accounts
created, no code changed. Companion to the Dark Protocol Aristotle pilot
(project `dark-protocol-pilot`, fired 2026-11-18 — Dark Protocol itself is
therefore *in flight* and excluded from the ranking below).

**Ranking key:** value at risk × crispness of invariants × tool fit.
**Tool key:** Aristotle = Rust→Lean, uploads source to Harmonic (a
disclosure decision per submission; per-run pricing not itemised, 500
free credits at sign-up). Certora = the existing CVL/CVLR track owned by
another chat — overlaps are marked, not double-sold. TLA+ = protocol /
state-machine model checking. PBT = property-based testing / invariant
fuzzing (fast-check, Hypothesis, proptest, LiteSVM). Kani = Rust unit
model checking.

---

## Tier 1 — submit-ready-shaped (Rust, on this VM, money-critical, crisp)

### 1. Musebook orderbook — **the next pilot**
- **Where:** `~/workspace/goals/solana-native-onchain-limit-orderbook-for-musebook/program/`
  — Rust (native, `src/state.rs`, `src/instructions/{init_orderbook,
  create_order, cancel_order, take_order, register_maker,
  deposit_withdraw, sweep_fees}.rs`, ~2,300 LOC + 567 lines of state
  tests). JS SDK alongside (`sdk/orderbook.js`).
- **Live status:** mainnet preparation COMPLETE (fresh mainnet program
  `Fz3VxyZqRC4XVydPpLbqXRhUiCspgZQgD44St7ghcVut`, ~0.66 SOL peak cost,
  zero mainnet writes, launch decision still the dev's). Devnet E2E
  28/28 — but against a *different* program/build
  (`FWRDGY2vEnG1GM4cq8ErRUFM6RGrmQ2onnoCTWfCr49e`). Domain:
  orderbook.musebook.trade.
- **At stake:** everything a matching engine holds — maker deposits,
  locked balances, fee accrual — from the first mainnet user.
- **Headline properties (Aristotle style):**
  1. *Custody conservation* — for any instruction sequence, the book's
     vault balances equal the sum over makers of (deposits − fills −
     withdrawals) plus accrued fees; the program never creates or
     destroys base/quote.
  2. *Lock integrity* — a maker's locked amount always equals the sum
     over their open orders of remaining size × price (quote side) or
     remaining size (base side); a take can never consume more than an
     order's remaining size.
  3. *Fill correctness* — a take executes at the maker's price, never
     worse for the maker; fees taken are exactly `feeBps` of the fill,
     rounded in the book's favour or as specified — never more.
  4. *Cancel/withdraw gating* — only an order's maker can cancel it;
     only the maker can withdraw their unlocked balance; the fee sweep
     moves exactly the accrued-fee counter and resets it to zero.
  5. *Progress + error classification* (the Manifest headline) — a
     valid take against a funded, open order goes through under
     explicit conditions, and every error is classified by origin.
- **Tool fit:** Aristotle — this is the Manifest case-study shape
  almost exactly (they proved 28 results on an open-source Solana
  order book and found 2 real bugs). Small enough for a scoped run.
- **Blockers:** source not yet public → the same disclosure approval
  the dev just gave for Dark Protocol is needed. No other blocker;
  proving *before* mainnet launch is the ideal order.
- **FV cannot cover:** CU/termination, the JS SDK's wire format (the
  existing `ix_wire` test covers client↔program drift), token-program
  behaviour (assumed).

---

## Tier 2 — worth a spec + targeted proofs or model checking

### 2. Percolator v16 risk engine + prog wrapper (percolator.tech / GM8z stack)
- **Where:** engine `~/workspace/clawd-percolator/programs/percolator/
  src/v16.rs` (24,505 lines) + `wide_math.rs` (2,170); wrapper
  `~/workspace/percolator-prog-465/src/v16_program.rs` (17,321 lines).
  A verification charter already exists:
  `~/workspace/percolator-prog-465/INVARIANTS.md`, with a Kani harness
  (`kani/v16_kani.rs`, 112 lines) and `proptest-regressions/`.
- **Live status:** the GM8z mainnet desk trades toly's deployed
  program (`GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24`); our
  engine/wrapper is the launch stack. Either way this is the largest
  value-at-risk codebase in the fleet.
- **At stake:** solvency of every market on the engine — margin,
  liquidation, insurance-fund accounting.
- **Headline properties:**
  1. *Solvency conservation* — aggregate collateral always ≥ sum of
     account equities + insurance fund; no transition mints value.
  2. *Liquidation soundness* — an account is liquidatable only when
     its margin ratio is below maintenance; liquidation never leaves
     the liquidated account with positive equity extracted.
  3. *Retained-intent binding* — a signed intent executes only against
     the (market, asset generation, instruction kind, nonce) it was
     signed for; slot-reuse cannot replay it (the INVARIANTS.md §0
     correction, already written).
  4. *Wide-math exactness* — the i128/wide arithmetic kernels round
     only in the protocol's favour, never the trader's.
- **Tool fit:** Kani + proptest on leaf kernels (wide_math, fee and
  liquidation math) — the path the charter already chose; Aristotle
  only for a *scoped leaf crate*, never the whole 42k-line route.
  **Overlap warning:** the Certora track's Phase 2 reportedly includes
  Dark Percolator; coordinate before any new Percolator-family FV
  spend so the two tracks don't prove the same lemmas twice.
- **Blockers:** scale (whole-route FV is a programme of work, not a
  pilot); multiple percolator trees on this VM (clawd-percolator,
  percolator-mainnet, gm8z-build, percolator-prog-465) — pin the
  canonical tree before proving anything about it.
- **FV cannot cover:** oracle trust (authority-push/Pyth values are
  inputs, not theorems), matcher behaviour across CPI, CU bounds.

### 3. Dark Percolator (dark.percolator.tech)
- **Where:** `~/workspace/dark402/programs/dark-percolator/src/`
  (lib.rs 735, state.rs 382) + engine crate
  `~/workspace/dark402/crates/dark-engine/src/` (position.rs, cross.rs,
  fee.rs, intent.rs, oracle.rs, ewma.rs; ~2,100 LOC total).
- **Live status:** devnet program `Cf8dRz9xhvdwU825LBu6SGHa3gcHMiJwVh8LciJK1hPz`.
- **⚠ Code-availability blocker (honest flag):** the deployed devnet
  binary was built from an **uncommitted tree on the dev's Mac**. The
  VM copy above may be stale; proving it could prove a program that
  isn't the one deployed. First step is the dev committing the Mac
  source — only then is this Tier 1-shaped (small, Rust, crisp).
- **Headline properties:** position conservation across open/close/
  liquidate; `Position::liquidate` errors on a healthy account (the
  H-2 item still open from the audit); margin/fee arithmetic never
  rounds in the trader's favour; intent replay binding.
- **Tool fit:** Aristotle once canonical source lands. **Overlap:**
  Certora Phase 2 (see §2) — dedupe before submitting.

### 4. z402 voucher / ledger core (x402.wtf hub)
- **Where:** core `~/workspace/z402/solana/src/` (JS: `voucher.mjs`,
  `ledger.mjs`, `credit.mjs`, `deposit-indexer.mjs`; test:
  `solana/test/voucher-core.test.mjs`) and its Worker adaptation
  `~/workspace/z402/omni/z402.mjs` (724 lines: `verifyVoucherKv`,
  `balanceByOwner`) inside the live hub worker
  `~/workspace/z402/omni/worker.js` (1,262 lines).
- **Live status:** LIVE — z402 voucher sessions/verify/policy/
  deposit-scan run on a KV ledger at the x402.wtf hub, which settles
  real payments on 9 chains (the EVM EIP-3009 verify + gas-only
  relayer settle path also lives in worker.js; Base is delegated to
  CDP). The KV namespace has already hit Cloudflare's free daily
  write limit once in production.
- **At stake:** voucher credit is money. A double-redeem or a
  credit-without-deposit bug is a direct, silent loss.
- **Headline properties:**
  1. *Monotone redemption* — a voucher's redeemed total never exceeds
     its issued amount, and never decreases; each redemption applies
     exactly once.
  2. *Credit soundness* — ledger credit for an owner/mint exists only
     against an observed deposit; total credited ≤ total deposited.
  3. *Policy conformance* — verify accepts only vouchers inside the
     session policy (expiry, per-call price, chain/mint binding).
  4. *Idempotent deposit scan* — re-scanning the same deposit credits
     it zero additional times.
- **Tool fit:** Aristotle cannot take JS. Right tools: **TLA+** model
  of the voucher protocol (issue → deposit-scan → redeem against a
  KV store with weak consistency) + **fast-check PBT** on the core
  modules. **Surprise/divergence risk:** the core exists twice — the
  tested `solana/src` core and the adapted `omni/z402.mjs`. Proofs and
  tests on one do not cover the other; the spec must name the deployed
  adaptation as its target and diff the two.
- **FV cannot cover:** KV's actual consistency behaviour (model it as
  an assumption), upstream chain finality, the relayer key's safety.

### 5. Clawd Compute Stripe → credit chain (clawdcompute.us)
- **Where:** module `~/workspace/clawdcompute-stripe-wiring/
  stripe-webhook.js` (593 lines, with `tests/stripe-webhook.test.mjs`),
  **spliced live** into the gateway worker
  `~/workspace/musebook-ai-gateway/worker.js` (7,311 lines, splice at
  line ~6272) — routes `POST /v1/stripe/webhook`,
  `GET /v1/stripe/claim/<token>`, `/v1/stripe/deliver`. Balances are
  integer micro-USD at `bal:<wallet>` in KV; keys `mbg_live_…` stored
  as SHA-256 hashes only; Stripe customers bind to `stripe:<cus_id>`.
- **Live status:** LIVE — Starter $20 / Pro $79 / Scale $249
  subscriptions + $10/$50/$100 credit packs; the chain was verified
  end-to-end with a signed test checkout (credited exactly $10.00,
  claim issued a key exactly once). First *real* customer payment
  still unproven.
- **At stake:** card money converted to API credit. Double-crediting
  an invoice or a reusable claim token is direct revenue loss.
- **Headline properties:**
  1. *Exactly-once crediting* — for any multiset of delivered webhook
     events (duplicates, retries, reordering), each paid invoice/
     session credits its amount exactly once.
  2. *Claim-once* — a claim token yields a live API key at most once;
     after redemption it is dead forever.
  3. *Allowance integrity* — a subscription period grants exactly the
     tier allowance (20M/79M/249M micro-USD); renewal never stacks a
     second grant for the same period.
  4. *No credit without signature* — an event that fails Stripe
     signature verification changes no balance, key, or ledger state.
- **Tool fit:** JS → no Aristotle. **TLA+** for the claim/credit state
  machine + **fast-check PBT** with adversarial webhook replays
  (duplicate/out-of-order/forged events) against the module. Cheap,
  high-value.
- **FV cannot cover:** Stripe itself, the webhook secret's custody,
  KV write atomicity (the exactly-once property must be stated
  against the KV operations the code actually performs).

### 6. x402m facilitator — single-signature batch settlement
- **Where:** `~/workspace/x402m-repo/cloudflare/x402batch.js` (+
  `x402batch.test.mjs`) and the standalone kit
  `~/workspace/muse-facilitator-kit/` (~944 lines JS: `lib/server.js`,
  `lib/solana.js`, `lib/evm.js`, `mainnet_settle.mjs`).
- **Live status:** LIVE (x402m.musebook.trade; the z402 hub marks
  "x402m batch live"). Non-custodial: payers sign, facilitator
  verifies and relays.
- **Headline properties:** a batch settles each contained payment
  exactly once; the settled total equals the sum of the signed
  authorisations — no more, no less; a payment whose authorisation
  fails verification aborts or is excluded, never settled partially;
  replaying a submitted batch settles nothing twice.
- **Tool fit:** small and crisp → spec + fast-check PBT; TLA+ sketch
  of the batch state machine if a second implementation appears.
- **Blockers:** two implementations (repo worker + kit) — name the
  deployed one as the target.

### 7. DecentraPredict program
- **Where:** `~/workspace/decentrapredict/programs/decentrapredict/
  src/` — Anchor Rust, 1,307 LOC.
- **Live status:** not deployed (devnet prepared, pending faucet);
  tests green "including exact payout math" per its README.
- **Headline properties:** payout conservation (winners' payouts sum
  to the pool minus fee, exactly); a resolved market pays each
  winning position once; resolution authority cannot redirect payouts
  after resolution.
- **Tool fit:** Aristotle-shaped and small — but nothing is at risk
  until it deploys, so it queues behind the live candidates. Revisit
  at its mainnet decision, like the orderbook.

### 8. Solana Agent Network (SAN) program — already in flight
- **Where:** `~/workspace/agent-network-repo/programs/agent-network/`
  (Rust, LiteSVM tests) with an existing Certora scaffold at
  `verification/certora/`.
- **Disposition:** FV work has *already started* here under the
  Certora umbrella. Listed for completeness — do not open a second
  track; ask the Certora track for its status instead.

---

## Tier 3 — property-based testing / invariant fuzzing is the right tool

| Component | Where | Why PBT, not FV |
|---|---|---|
| **gateway-access credits service** (clawd-tee gateway accounting; 1 credit = $0.002) | `~/workspace/gateway-access/src/*.js` (~1,400 LOC, Neon Postgres; tests incl. `payments.test.js`) | The real risk is *concurrent* debits racing a balance — a DB-transaction/concurrency property. Invariant fuzzing + transaction-isolation audit beats proof here. Properties: balance never negative; a key's total debits never exceed credits + free allowance; free-tier daily caps (30 chat / 60 embeddings per session *and* IP) never exceeded under interleavings. |
| **Dark multisig digest (NEW-4)** | `~/workspace/dark-defi-rewrite/client/src/multisig.js:22-36` (carried in the merged tree's register) | The property is one line — the proposal digest is injective over (proposalId, action, payload) — and the *fix* (length-prefix each field) is known. Fix it, then a 20-line fast-check property proves the class dead. A theorem prover is overkill for a client-side JS helper. |
| **darkx402 attestation verifier** | `~/workspace/dark402/apps/attestation-verifier/src/{nitro-verify,pcr-verify}.ts` (TS; `pcr-verify.test.ts` exists) | Crisp accept/reject property (accept iff valid Nitro doc + PCR match + cert chain to the AWS root), but TS and **not deployed** (Render GitHub App access still owed; EXPECTED_PCR0/1/2 still owed from a real nitro build). Adversarial corpus testing — mutated attestation documents must never verify — is the fit. Note the app deploy itself still hasn't landed; sequence FV after deployment exists. |
| **darkx402 holder gates** | `~/workspace/dark402/apps/darkx402/src/app/api/gate/*` (TS) | Gate predicates (balance ≥ threshold at a *fresh* read) are small; the failure mode is stale-balance reads, an integration property — PBT + read-freshness tests. |
| **ORE miner policy caps** | `~/workspace/ore-miner/ore_miner.py`, `~/workspace/ore-rig-agent/rig_agent.py` (Python; `test_phase1.py` exists) | Per-round cap, daily cap, reserve floor, fail-closed advisory gate = a small state machine in Python. Hypothesis stateful testing is exactly the fit; TLA+ only if the caps ever guard serious size. |
| **$CLAWD buy/burn loops** | `~/workspace/clawd-token-ops/bin/clawd_buy_loop.py`, `clawd_burn.py` (Python) | Exact-amount invariants (0.01420 SOL/buy etc.) are already enforced by the standing verify-each-receipt-on-chain practice; loops are currently dry/stopped. PBT the amount/cap arithmetic if the loops are ever re-armed at new parameters. |
| **clawd-gate worker** | `~/workspace/clawd-gate/worker.js` (86 lines) | One property — *never open on KV error/missing key* — and it was already flip-tested in both states live. A small exhaustive test closes it permanently. |
| **ClawdRouter metering** | `~/workspace/clawd-router-final/` (TS) | Billing accuracy matters, but the code churns (rebrands, provider changes weekly). PBT on the metering arithmetic; FV would chase a moving target. |
| **Trading-bot risk gates** (Imperial/Phoenix/JEV wrappers) | various skill/agent trees | JEV is dry-run-only by design (no value at risk — excluded outright). Live Imperial/Phoenix paths route through third-party executors; the *predicates* (size/leverage caps) are PBT-shaped, the execution itself is not ours to prove. |

---

## Excluded — with reasons

- **Dark Protocol** — already in the Aristotle pilot (fired today).
- **solana-redpill-verifier** — Certora Phase 0 already owns it
  (50 CVLR rules attempted there); a second track duplicates.
- **Legacy Dark DeFi programs** (prop-vault, private-ledger,
  mm-oracle — `~/workspace/dark402/phoenix-private-prop-mm-master/
  programs/`, ~2,000+ LOC Rust) — frozen, not rewritten, not live
  with real funds; the 2026-11-16 audit already catalogued
  Critical-class holes (settlement attestation without backing
  checks, stale-NAV settlement while paused). The gap there is a
  fix-or-retire decision, not proofs. FV spend only if revived —
  and then the rewrite comes first, proofs second.
- **PayBox** — third-party (MoonPay). Not our code; partnership
  surface only.
- **payment-channels program** (`~/workspace/payment-channels/`) —
  third-party (backs the MPP/x402-foundation specs; live under
  program `CHNLxYvV…`, carries its own `audits/`). We integrate, we
  don't own it.
- **Musebook Town vested airdrop** — no code exists; the goal's
  terms are "still to be specified." Nothing to verify yet. (The
  treasury's CLAWD lock is Streamflow's contract — third-party.)
- **Rings / Lana (SPR)** — by standing rule, spending/decryption is
  user-side only with the user's own keys; the server holds no
  shielded keys, so there is no value-bearing server logic to prove.
  The crypto itself is Helius's SPR SDK (third-party).
- **OWS omni-chain treasury (z402-treasury)** — wallet infrastructure
  is the OWS SDK (third-party); our surface is a policy *config*
  (leg-chains-only, 30-day expiry), already verified behaviourally
  (policy denied Ethereum as designed). Config review, not FV.
- **Crossmint wallet creation** (clawdcompute.us/wallet) — custody
  and wallet creation are Crossmint's; our code is glue, and sending
  isn't even enabled yet.

---

## Cross-cutting notes

1. **Three separate credit ledgers exist** — the gateway worker's KV
   balances (Stripe chain), gateway-access's Neon credits, and the
   z402 KV voucher ledger — with no shared invariant spec. The
   cheapest fleet-wide FV win is writing the three specs in one
   sitting while the patterns are fresh from the Dark pilot.
2. **Duplicated cores are the recurring hazard:** z402 voucher core
   (tested core vs deployed adaptation), x402m (repo worker vs kit),
   Percolator (four trees). Every FV engagement must pin *the
   deployed artefact's* source first, or it proves a program nobody
   runs — the Dark Percolator Mac-source flag (§3) is the same trap.
3. **What FV never covers, fleet-wide:** compute-unit/termination
   bounds (Aristotle has none — the Poseidon-cost class stays with
   measurement + rehearsal), oracle truthfulness, upstream-provider
   trust (Stripe, CDP, Crossmint, MoonPay), key custody, and KV/DB
   consistency except as explicitly modelled assumptions.
4. **Disclosure ledger:** every Aristotle submission uploads source
   to Harmonic. Dark Protocol's was approved today. The orderbook
   (Tier 1) needs the same one-line approval when its turn comes;
   nothing else in Tier 1/2 should be uploaded without it.
