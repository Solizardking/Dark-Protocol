# Helius Privacy Rings (SPR) integration

**Status (2026-11-19): integration in progress — client, explorer, and
the shielded-swap design are done; the rail itself is not live yet.**

Dark Protocol has two complementary shielded-balance layers:

- **Its own Groth16 pool** (in [`dark-protocol/`](../../dark-protocol/)) —
  a Poseidon/BN254 shielded SOL pool with on-chain proof verification,
  live on devnet, gated on an MPC ceremony + formal verification before
  mainnet.
- **Helius Solana Privacy Rings (SPR)** — Helius's shielded pool of
  encrypted UTXOs with view tags, a hosted indexer, and TEE proving via
  the `@heliuslabs/spr` SDK. SPR gives Dark Protocol a second,
  independently-implemented private balance to build Dark Payments,
  private x402, and shielded swaps on.

## What is already built

- **SPR wire client** — a working client for the indexer/prover API
  (the reference for the corrected call shape: `POST /v1/spr/{method}`
  with the method in the path *and* the body, `api-key` as a query
  param, `error` inspected even on HTTP 200, back-off on `-32016`).
- **Rings explorer** — a same-origin proxy worker (`POST /api/spr/<method>`
  with a seven-method allowlist, `/api/prover/*` with an exact
  path+method allowlist, the worker's key injected server-side so the
  Helius key never ships to a browser), plus the rings wallet client
  pattern: derivation, sync via `getEncryptedUtxosByTags`, deposit /
  transfer / withdraw.
- **Dark Protocol private wallet on SPR** — merged 2026-11-19
  (clawd-tee PR #34: "Privacy Rings: Dark Protocol private wallet on
  Helius SPR + Umbra gateway").

## The shielded swap design (spec written 2026-11-19)

SPR has no swap primitive — only shielded deposit / transfer / withdraw.
The rail is therefore a composition:

1. **Withdraw** from the ring to a fresh, one-time ephemeral wallet.
2. **Swap publicly** from that wallet (the trade itself is a public
   trade from an unlinked wallet; size and timing are visible).
3. **Redeposit** the proceeds to the shielded address.

Honest privacy grade: the user's wallet is not linked to the trade
on-chain and balances inside the ring stay encrypted; deposits into and
withdrawals out of the pool are public events, and timing/amount
correlation is possible. The words *anonymous* and *untraceable* are
not used for this rail.

Cost shape: ~1,100–3,100 Helius credits per shielded swap (proofs are
1,000 credits each; the deposit leg is proofless), plus 3–5 user-paid
transactions. A 10-step devnet proof plan (registration → deposit →
confidential transfer → withdrawal → full composition → gateway
verifier → proxy metering → browser proof → failure drills) gates any
mainnet pilot, which is scoped to SOL / USDC / USDT / $CLAWD at a
small per-wallet daily cap.

## Gates before mainnet

- The token-out swap rail live first, with receipts proven.
- Helius plan headroom confirmed (proof credits are the marginal cost).
- SDK pinned and reviewed; any SDK upgrade re-runs the devnet proof.
- Explicitly **not** gates for this rail: the Dark Protocol MPC
  ceremony (a different ZK stack) and MagicBlock PER (not used here).
