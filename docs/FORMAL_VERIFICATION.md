# Formal verification: scope and request to the Solana Foundation

This doc goes with the public page at <https://protocol.darkx402.com/solana-foundation>
(also served at `darkx402.com/dark-protocol/solana-foundation`). If you change one, change the other.

> **Status, November 19, 2026:** no property in this document has been formally proved yet.
> The first proof run (Aristotle project `dark-protocol-pilot`, November 18, 2026) used its whole
> 500-credit signup grant and ended `OUT_OF_BUDGET`, with all seven properties unresolved: none
> proved, none refuted, no counterexamples. The Solana Foundation has **not** funded, endorsed or
> reviewed this work. This is a request.

## 1. What we've built

| Component | Where | State |
|---|---|---|
| Dark Protocol privacy pool (v2): Groth16/BN254 withdraw proofs, Poseidon leaf binding, nullifiers, root history | Program `2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (devnet) | Devnet, mainnet not launched |
| Shielded note pool v1: Sapling-compatible ChaCha20-Poly1305 encrypted notes, nullifier PDAs, 1→2 shielded transfer | [`dark-protocol-program/`](../dark-protocol-program/programs/dark-protocol-program/src/lib.rs), program `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm` | Devnet, alpha |
| Confidential AI agents: TEE quotes, SAS anchoring, sealed inference, x402 `dark-shielded` payments | [`packages/tee-agents/`](../packages/tee-agents/README.md) | Alpha |
| Umbra gateway: TEE-gated RPC/indexer/prover proxy; sends and prover return `423` until attestation is VERIFIED; origin allow-list | Solizardking/clawd-tee (private), `docs/UMBRA.md`, PR #34 | Ran on Intel TDX (Phala Cloud), verifier `OVERALL: VERIFIED` on 2026-11-14 |
| Zolana dark wallet: public + shielded balances; register/shield/send/unshield built client-side and signed by the user's wallet, server never signs | Solizardking/clawd-tee `zolana-wallet/`, PR #34 (merged 2026-11-19) | Integrating |
| Order-book pilot: 8 properties for the limit order book that will settle Dark Percolator trades | Packaged alongside the pool pilot | Paused, no credits |

## 2. Why formal verification matters here

1. **ZK and confidential-state soundness.** When amounts and owners are hidden, the program's own
   bookkeeping is the only defense against a drain. We have already fixed one bug of this kind
   (`NEW-1`: a deposit's amount was not bound to its note). A proof that the inserted leaf is
   always `poseidon2(cm, amount_to_field(amount))` for the amount actually transferred rules out
   that whole class of bug.
2. **TEE attestation gating logic.** Confidential compute is only as good as the code that decides
   "this enclave is trusted". While writing this scope we found an inconsistency in
   `packages/tee-agents/src/attestation/tee.ts`. `importHardwareQuote()` sets
   `measurement = sha256(rawQuote)`, but `verifyTeeQuote()` requires
   `measurement === computeMeasurement(identity)`. Hardware-imported quotes therefore can't pass the
   envelope check as written. A single formal spec of the envelope would have caught this.
3. **On-chain program invariants.** Conservation, no admin path, a rejected proof never burns a note,
   progress, and an append-only root history. These are universal statements over every instruction
   sequence, so only a proof settles them.

## 3. Verification scope

### P-A. Privacy pool program (Rust/Anchor, ~1,760 lines). Tool: Aristotle (Harmonic), specs packaged

| # | Property | Statement |
|---|---|---|
| 0 | No UB / no panics | All handlers and helpers, on valid inputs: checked arithmetic, in-bounds fixed arrays |
| 1 | Lamport conservation | `total_withdrawn ≤ total_deposited`; vault ≥ deposited − withdrawn; donations can't inflate the ledger; `transfer` moves no lamports |
| 2 | Withdraw gating | The payout CPI is reached only after `amount > 0` → root in history → solvency → Groth16 verify, in that order; a failure rolls back the nullifier marker |
| 3 | Deposit binding (NEW-1) | The inserted leaf is `poseidon2(cm, amount_to_field(amount))`, and the same `amount` goes to the transfer CPI |
| 4 | Authority impotence | `authority` is written once and authorizes nothing; the only vault debit is the proof-gated withdraw |
| 5 | Progress + error classes | A valid withdraw (rent-floor preconditions stated) always succeeds; every error is classified by origin |
| 6 | Root history / frontier integrity | Only program-produced roots; eviction exactly after 32 newer roots; the frontier matches a from-scratch recount |

Stated assumptions: `sol_poseidon` and the `groth16-solana` verifier are treated as contracts.

### P-B. Withdraw circuit (Circom, Groth16/BN254, depth-20 Merkle tree). Candidate tools: Picus, Circomspect

- No under-constrained signals (each public input determines a unique valid witness)
- Nullifier determinism and per-note uniqueness
- Merkle-membership soundness at depth 20
- Public inputs bind `root`, `nf`, `recipient_field(recipient)` and `amount`

Out of scope here: trusted-setup soundness, which the MPC ceremony covers.

### P-C. Shielded note pool v1 (this repo). Candidate tools: Kani or Aristotle

- **Spend authorization (open in v1).** In v1, `withdraw` and `shielded_transfer` don't yet
  bind a spend to proof of note ownership on-chain (the v2 pool does this with Groth16). The
  property to state, fix and prove is that a spend needs proof of note ownership. v1 is devnet-only
  alpha software, not for real funds (see README).
- Value conservation across 1→2 transfers; no overflow (`checked_add`)
- One-time spend: a note's `spent` flag and nullifier PDA are written exactly once

### P-D. Umbra TEE gate (Rust, clawd-tee). Candidate tools: TLA+ or Lean model plus Kani on handlers

- No send or prover request is forwarded unless the gate state is VERIFIED with a fresh nonce
- Origin (`UMBRA_ALLOWED_ORIGINS`) and RPC-method allow-lists are total; nothing else is proxied
- `HELIUS_API_KEY` never appears in a response body, header or log line (`api-key=` is redacted)

### P-E. Attestation verifiers (ACI verifier, `dark-tee-agents`). Candidate tools: Lean spec plus derived property tests

- `report_data` binds the keyset digest and the verifier's nonce (no replay)
- `verifyTeeQuote` accepts exactly the allow-listed measurements and providers within `maxAgeSeconds`
- Hardware-imported and software quotes satisfy one envelope spec (see §2.2)

### P-F. Order-book settlement (Dark Percolator). Tool: Aristotle

Eight properties are packaged. The pilot is paused until it has credits.

## 4. The ask

1. **Phase 1: finish the pool (P-A).** Resume the existing Aristotle project, starting with deposit
   binding and conservation. From the observed burn rate we estimate **$1,000–$2,000 in credits**.
2. **Phase 2: circuit and gate (P-B, P-D, P-E, plus P-C so v1's gaps are specified).**
3. **Phase 3: settlement (P-F).**

Either credits paid directly to a verification provider or funding earmarked for verification
works. We'll publish a costed plan for Phases 2–3 before any spend.

## 5. What the ecosystem gets back

- Open specs, Lean artifacts and raw verifier output, in a public repository
- A public report per property: proved, refuted with its counterexample and our fix, or unresolved
  with the boundary stated. Published whether the results are good or bad.
- Reusable primitives: amount-bound Poseidon leaves, nullifier-PDA one-time spend, append-only root
  history, and an attestation-gated RPC proxy pattern
- A worked case study of formally verifying a ZK-adjacent Solana program, including its cost

## 6. Integrations in progress

- **Helius Privacy Rings (`@heliuslabs/spr`): integrating.** It's wired into Umbra and the Zolana
  wallet in clawd-tee (PR #34, merged 2026-11-19). On devnet, with a throwaway key and
  `@heliuslabs/spr 0.9.0-alpha`, we shielded 0.01 SOL into the default Ring and unshielded 0.005 SOL
  with a ZK proof. Before that, the SDK attested the Helius prover against Helius's signed devnet TEE
  policy. A private transfer between two shielded addresses has not been run yet. By default a
  Ring is confidential, not anonymous: sender, recipient and tx hash stay public.
- **Crossmint: integration in progress.** We'll document its scope when it ships.

Neither is a partnership or an endorsement.

## 7. Limits

- No property is proved yet.
- Formal verification proves stated properties under stated assumptions. It isn't a blanket guarantee.
- Dark Protocol is devnet-only. Mainnet waits for the MPC ceremony and these results.

## Sources for every claim

| Claim | Source |
|---|---|
| v1 pool design, program id, spend checks | `dark-protocol-program/programs/dark-protocol-program/src/lib.rs`; `README.md` |
| TEE quote envelope, measurement mismatch | `packages/tee-agents/src/attestation/tee.ts` (`importHardwareQuote`, `verifyTeeQuote`) |
| SAS anchoring, sealed inference, x402 `dark-shielded` | `packages/tee-agents/README.md` |
| Umbra gate (423 until VERIFIED), origin allow-list, server never signs | Solizardking/clawd-tee PR #34 body; `docs/UMBRA.md` |
| TDX run, `OVERALL: VERIFIED` (2026-11-14) | clawd-tee `docs/UMBRA.md` |
| Privacy Ring devnet shield/unshield, prover attestation, "confidential, not anonymous" | clawd-tee `docs/UMBRA.md` |
| v2 pool program id, seven properties, OUT_OF_BUDGET, 500 credits | `Solizardking/Dark-Pool-main` `dark-protocol/aristotle/README.md`; published article at `/dark-protocol/article` |
| Root history ages out after exactly 32 newer roots | Published home page `/` (promise 6) |
| ~1,760 lines, $1,000–$2,000 estimate, 8-property order-book pilot, NEW-1 | Published article at `/dark-protocol/article` |
