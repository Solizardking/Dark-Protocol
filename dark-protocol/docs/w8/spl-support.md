# W8-A — SPL support design (follow-on work order, NOT part of the core transplant)

**Status: design only. The merged v1 is native-SOL only, loudly** (SDK
migration note, README). Nothing in this document is implemented.

## Problem

The shared contract's value is a bare BN254 field element: the circuit
proves `cm = Poseidon(owner_id, value, blinding)` and full-note spends of
`value == amount`. There is no mint dimension anywhere — not in the
circuit, not in the Pool account, not in the events. Dark-protocol's
legacy surface promised SPL everywhere (per-note `token_mint`, token
accounts in every handler); that surface was dropped, so SPL must be
designed back in deliberately rather than inherited.

## Options

### A — Wrapped-SOL pool (v1.5 candidate)
The vault PDA owns a wSOL token account alongside its lamports.
`deposit` accepts either native SOL (current path) or wSOL transferred
into the vault's token account; `withdraw` pays out in wSOL (unwrap is
the client's business). The circuit, VK, tree, and leaf binding are
**unchanged** — value is still one scalar asset, just held in wrapped
form.
- Pros: zero circuit/ceremony impact; one pool, one tree, one indexer.
- Cons: only ever wSOL — this is a custody-form feature, not SPL support.

### B — Per-mint pools (the general design)
`Pool` PDA seeds become `["pool", mint]`; each mint gets its own tree,
vault token account, root ring, and totals. The circuit and VK are
unchanged (a note's value is still a scalar; the mint is pool context,
not a public input). The indexer runs per-pool namespaces.
- Pros: real SPL support with no new ceremony; NEW-1 binding carries
  over verbatim per pool (leaf = Poseidon(cm, amount) inside that mint's
  tree); insolvency is per-mint by construction.
- Cons: liquidity fragments per mint; clients must track (mint → pool,
  tree, indexer feed); deposit/withdraw account lists grow a mint +
  token accounts; the SDK/wallet UX must make the mint dimension
  unmissable (a cm is only spendable in its own mint's pool).

### C — Mint as a circuit public input (rejected for this work order)
Binding the mint inside the proof (public input or committed in `cm`)
requires a circuit change, a new ceremony, and a new VK. It buys
cross-pool note portability the product has not asked for. Revisit only
with a concrete requirement.

## Recommendation
A if wrapped custody is independently wanted; **B as the SPL work
order**, in this sequence: program (seed change + token accounts +
per-mint totals) → indexer (per-pool feeds) → client-lib (mint-aware
notebooks) → SDK (shield/unshield gain a mint parameter, defaulting to
SOL with no silent fallbacks) → tests mirroring the v1 suite per mint,
including a NEW-1-style drain attempt per mint and a cross-mint spend
attempt (must fail: wrong pool, wrong tree).

## Gates
Fresh adversarial review of the deposit path per mint (the entrance is
where NEW-1 lived); re-audit before any "audited" language; W5-class
devnet rehearsal per mint before mainnet is discussed.
