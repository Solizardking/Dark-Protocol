# W8-C — Production MPC ceremony + VK rotation procedure (follow-on work order)

**Status: procedure spec. The merged program's VK comes from a LOCAL,
SINGLE-CONTRIBUTOR dev ceremony (see `programs/dark-protocol/src/vk.rs`
header and `zk/`). It is devnet-appropriate and a hard blocker for any
mainnet conversation. This document is the rotation path.**

## Why rotation is a program change in v1

The verifying key is pinned as constants in `vk.rs` — deliberately: no
instruction accepts key material, so no caller can substitute a VK
(W4 invariant). The cost of that safety is that rotating the VK means
redeploying/upgrading the program binary. A future design may move the
VK into a dedicated account with its own rotation ceremony; that is a
separate audited track, not a config change, and is NOT assumed here.

## Procedure

1. **Ceremony.** Multi-party phase-2 over the existing Powers of Tau
   (or a fresh ptau if the circuit changed — transfer circuit, W8-B,
   sizes its own): ≥3 independent contributors, each contributing via
   `snarkjs zkey contribute` with entropy from their own machine,
   sequential hand-off with published hashes after each contribution,
   final `snarkjs zkey verify` + beacon. Transcript (contributor
   attestations, hashes, verify output) is published with the release.
   The dev ceremony's single-contributor transcript is the anti-pattern
   this replaces; never reuse its zkey.
2. **Export.** Run the ZK track's own pipeline (`zk/scripts/export_vk.js`,
   `generate_vk_rs.js`) to produce `vk_solana.bin` + the `vk.rs`
   drop-in. Zero hand-typed constants — if a number was typed by a
   human, the rotation is void.
3. **Splice + verify.** Replace `programs/dark-protocol/src/vk.rs` with
   the drop-in; run the byte-identity check (vk.rs constants == exported
   bin, 768 bytes for the current circuit shape) and the full suites:
   program `cargo test` (VK shape + gamma tests must pass against the
   new key), ZK e2e, client tests. `VK_IS_PLACEHOLDER` stays `false`;
   the vk.rs header is updated to name the MPC ceremony + transcript
   location instead of the dev-ceremony warning.
4. **Deploy as an upgrade, not a fresh pool** (devnet first, W5 flow):
   the Pool account persists; `vk_is_placeholder` on-chain reflects the
   *initialize-time* key, so a VK rotation must be paired with an
   explicit on-chain signal (an upgrade note in release docs + the
   programdata slot) — clients pin the expected VK hash per program
   version. Document the old-VK proofs' status: proofs made under the
   old circuit/VK stop verifying the moment the binary upgrades; any
   in-flight withdraws must land first (announce a freeze window).
5. **Re-audit gate.** A rotated VK is a new verifier in every way that
   matters: the re-audit checklist (original 39-finding method) re-runs
   against the rotated tree before any "audited" language is used.

## Non-goals
No on-chain VK accounts, no admin rotation instruction, no ceremony
automation that holds contributor entropy server-side. Ever.
