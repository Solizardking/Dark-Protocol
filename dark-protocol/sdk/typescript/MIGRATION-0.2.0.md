# @dark-protocol/sdk 0.2.0 — core transplant migration note

0.2.0 replaces the SDK's program core wholesale (TRANSPLANT-SPEC W6).
The program is now the Groth16 shielded **SOL** pool from the Dark DeFi
rewrite. This is a breaking release; there is no compatibility shim,
because the old surface described constructions that were audited and
found to be fake (SHA-256 "Pedersen", hash-based "Sapling" derivation,
verifiers that never verified). Keeping their shapes would keep the lie.

## SOL-only, loudly

The merged v1 program moves **native SOL only**. The legacy surface
promised SPL tokens everywhere; that promise is withdrawn in v1. SPL
support is a designed follow-on (see `docs/w8/spl-support.md`), not a
flag. SDK methods below take lamports; there is no mint parameter
because there is nothing honest to pass it to yet.

## Program ID

There is **no default program ID anymore**. The old SDK defaulted to a
placeholder string; construction now throws unless a program ID is
passed or `DARK_PROTOCOL_PROGRAM_ID` is set. The merged program is not
deployed: its fresh ID is generated at deploy time (W5) and lands in
`declare_id!`, Anchor.toml, this SDK's config, and the wallet constant
in one change.

**Retired program IDs — never use, never resurrect:**
`Bf3jjD5Pojx5mHZVwJCWg7wC1oPg2hsn7ufsWaKoHv9E` (legacy code-declared),
`Frf98UwzjLqiFUTNVY8kEdZsUW3xCuuSm8MSayBSmk4X` (legacy wallet-hardcoded;
what binary sits there is unknown from source),
`DARKxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx` (legacy SDK placeholder),
`1ujsjeHSdCtFVQdCFiohpRsy4auetTNw6M8vx8S4Wjv` (the dropped
shielded-wallet program — see the repo archive's DO-NOT-DEPLOY note).

## What changed in the client

- `getProtocolState()` / `getMerkleTree()` → **`getPool()`** (one Pool
  PDA, seeds `["pool"]`). Vault PDA: `["vault", pool]`.
- `getShieldedAddress()` and `getAIAgent()` are **removed** — on-chain
  shielded-address accounts and the AI-agent surface were dropped, not
  ported (TEE/agent features belong to a different stack).
- New instruction builders (they build, you sign/send):
  `initializePool(authority)`, `shield(depositor, { amount, cm })` →
  program `deposit`, `unshield({ proof, root, nf, amount, recipient,
  feePayer })` → program `withdraw`. Note the breaks that are security
  upgrades: withdraw now takes a **root** and a fixed 256-byte proof,
  and the payee is an account the program binds into the proof — a
  proof can no longer be redirected.
- The IDL is bundled (`src/idl/dark_protocol.ts`), generated from the
  merged crate — the old `loadIdl()` returned an empty object.
- Anchor TS bumped `^0.30.0` → `^0.32.1` to match the program's Anchor.

## Deleted modules (replaced, not ported)

- `sapling.ts`, `privacy.ts`, `note-encryption.ts` — BLAKE3/SHA-256
  stand-ins. Note construction, keys, Poseidon, Merkle paths and proof
  verification now come from **`@dark-protocol/client-lib`** (the
  rewrite client), re-exported via `src/proving.ts`.
- `ai-agent.ts`, `jupiter-swap.ts`, `swap.ts`, and the two swap
  examples — the AI-agent/private-swap instruction surface was dropped
  from the merged program's IDL (not stubbed). Jupiter constants survive
  as reference docs (`JUPITER_INTEGRATION.md`) for a future design.
- `wallet.ts` (`DarkWallet`) — unexported legacy helper built on the
  deleted types and a SHA-256 path-hash "derivation".

## Verification (transplant build, 2026-11-17)

`npm run build` (tsc + rollup) is clean and `npm test` passes **7/7**:
fail-closed construction with no program ID, env-configured ID honored,
bundled IDL shape (4 instructions / Pool + NullifierMarker / errors
6000–6009), PDA derivations, and shield/unshield instruction building
including malformed-proof rejection. The suite runs on `node --test`
against the built bundle — the pre-transplant jest configuration had
zero test files, and jest's ESM/CJS interop cannot load
@solana/web3.js's dependency chain in this stack (every other suite in
this project uses node --test for the same reason). One find from
verification: Anchor's idl-build print emits path-prefixed type names
and string-form `defined` references, which Anchor 0.32's account
coder rejects at `Program` construction; the bundled IDL is normalized
(plain type names, object-form refs), and the suite proves a real
`Program` constructs from it. The devnet integration test
(shield→unshield through this SDK only) is part of W5 and runs when
the pool exists.

## What did NOT change

The intent/rail layer is untouched: `intent.ts`, `private-payment.ts`,
`rail-authorization.ts`, `helius-dev-tools.ts`, the rail-worker, and
the wallet's Memo-anchor flow (whose commitments/nullifiers are now
real client-lib constructions — see the wallet's W6 notes — while its
transport stays Memo intents until the W5 pool exists to call).
