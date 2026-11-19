# Transplant build record — Dark Protocol core transplant

**Executed:** 2026-11-17, on the dev's go for TRANSPLANT-SPEC work orders
W0–W4 + W6–W8 (local build work only). **W5 (devnet rehearsal) is HELD**
for the dev's separate go — nothing was deployed, no program keypair was
generated, no transaction was sent, nothing was pushed.

**Source:** Solizardking/zolana-blockchain @ `3f497b1` (fresh shallow
clone) copied to this tree; donor = `~/workspace/dark-defi-rewrite/` in
its post-NEW-1-fix state, left intact as the reference. Spec:
`~/workspace/dark-defi-rewrite/TRANSPLANT-SPEC.md` (the authority for
every decision below).

## Layout of the merged tree

- `dark-protocol/programs/dark-protocol/` — the surviving program: the
  rewrite crate, package `dark-protocol`, lib `dark_protocol`. Logic
  byte-identical to the donor except the crate/module rename (W1/W2).
- `dark-protocol/zk/` — withdraw circuit + artifacts (`withdraw.*`
  naming, reconciled with the client), ceremony record in `keys/`.
- `dark-protocol/client-lib/` — the rewrite client as
  `@dark-protocol/client-lib`, the protocol's proving stack.
- `dark-protocol/sdk/typescript/` — `@dark-protocol/sdk` 0.2.0 (W6;
  see its `MIGRATION-0.2.0.md`).
- `dark-protocol/indexer/` — the pool indexer (W7).
- `dark-protocol/hardening/` — secret-scan guard + rotation runbook.
- `dark-protocol/docs/` — `W4-NEGATIVE-SPACE-AUDIT.md`, `w8/` follow-on
  specs (SPL, transfer circuit, ceremony/VK rotation, fees).
- `dark-protocol/archive/legacy-program/` — frozen snapshot of the
  retired legacy program (gated shell over fake constructions).
- `archive/shielded-wallet/` — the dropped ungated program, quarantined
  OUTSIDE the workspace with `DO-NOT-DEPLOY.md`. Never re-enable.
- `dark-wallet/` — wallet app; only `src/sdk/dark-protocol.ts` changed
  (program-ID config point + real client-lib note construction) plus a
  client-lib dependency + type declarations. Intent layer files are
  byte-identical to the source clone; `rail-worker/` is untouched and
  byte-identical.

## Work-order outcomes

- **W0 — donor re-verified green before any merge work:** ZK e2e 13/13,
  program `cargo +1.89.0 test --lib` 18/18, client 34/34, all run
  first-hand in the donor tree; `VK_IS_PLACEHOLDER = false`; circuit
  carries the NEW-1 bound leaf `Poseidon(cm, amount)`. (The spec text's
  W0 counts — 17/10/30 — are its pre-NEW-1-fix snapshot; the gate is
  "donor fully green," met at the post-fix counts.)
- **W1 — workspace surgery:** shielded-wallet archived outside the
  workspace; legacy program frozen to `archive/legacy-program/`; donor
  crate installed as `programs/dark-protocol`; workspace dependency
  block replaced with the rewrite's resolved Anchor 0.32.1 set; Jupiter
  path deps deleted. Gate: `cargo check` clean; merged `cargo test`
  18/18; old verifier modules exist nowhere outside the archives;
  `FeatureNotProductionReady` hits only in the archives.
- **W2 — surface naming:** program instruction names stay the rewrite's
  (`initialize`, `deposit`, `withdraw`, `transfer` — zero logic change);
  dark-protocol's vocabulary lives at the SDK boundary (`shield` →
  deposit, `unshield` → withdraw, `initializePool` → initialize;
  wallet keeps `shieldTokens`/`unshieldTokens`). Legacy→merged
  instruction map: `initialize_protocol`→`initialize`,
  `shield_tokens`→`deposit`, `unshield_tokens`→`withdraw`,
  `private_transfer`→`transfer` (still fail-closed); dropped with no
  successor: `create_shielded_address`, `add_to_privacy_pool`,
  `remove_from_privacy_pool`, `private_swap`, `verify_zk_proof`,
  `update_merkle_tree`, `register_ai_agent`, `execute_ai_action`.
  IDL generated from the merged crate and reviewed against lib.rs
  (accounts, args, events, error codes 6000–6009 all match).
- **W3 — program ID:** per the dev's decision (fresh ID at deploy
  time), the merged tree keeps the keypair-less placeholder
  `DTpM3xKbNYeVCPSZXvscr4USWjd7BWvq9m8qxGZ9wjd6` in exactly the config
  points W5 will flip in one change: `declare_id!`, Anchor.toml (all
  clusters), bundled IDL address, wallet constant; the SDK takes it
  from `DARK_PROTOCOL_PROGRAM_ID`/config and throws when unset. The
  three retired IDs survive only in archives, retired-bannered docs,
  and the SDK migration note that names them retired.
- **W4 — negative-space audit:** `docs/W4-NEGATIVE-SPACE-AUDIT.md` —
  14 grep-evidenced absences + secret-scan clean (0 failures) + kept
  layers proven byte-identical to the source clone.
- **W6 — SDK + wallet migration:** IDL regenerated from the merged
  crate and bundled; `getPool()` replaces the legacy getters; dropped
  getters removed; `initializePool`/`shield`/`unshield` builders added;
  fake-crypto SDK modules deleted and replaced by the client-lib
  proving bridge (`src/proving.ts`); Anchor TS ^0.32.1. Verified:
  `npm install` (657 packages), `npm run build` (tsc + rollup) clean,
  `npm test` **7/7** (node --test against the built bundle — the repo's
  jest setup had zero test files pre-transplant and its ESM/CJS
  interop cannot load web3.js's dependency chain; see the SDK
  migration note). One IDL normalization find during verification:
  Anchor's idl-build print emits path-prefixed type names and
  string-form `defined` refs, which Anchor 0.32's account coder
  rejects — the bundled IDL is normalized to plain names + object-form
  refs, and the suite proves a real `Program` constructs from it.
  Wallet: Frf98 constant replaced by
  the single config point; `createCommitment`/`createNullifier`
  string-hash helpers deleted — commitments are real client-lib
  Poseidon notes (note key derived from a wallet message signature,
  fail-closed), and the intent layer records no nullifier rather than a
  fabricated one. The wallet's Memo-intent flow is otherwise unchanged.
  The spec's W6 devnet integration test is W5-gated (no pool exists
  until W5).
- **W7 — indexer:** built per INTEGRATIONS W-3 (Helius tail, bound-leaf
  tree rebuild, `/root` `/path/:i` `/spent/:nf` API). Local gate green:
  scripted client-lib deposit sequence replayed as program-faithful
  events rebuilds the exact reference root after every deposit; the
  on-chain equality check (indexer root == Pool.current_root) is
  W5-gated.
- **W8 — follow-ons specced, none implemented:** `docs/w8/` holds the
  four design specs the spec assigns to W8 (SPL support, transfer
  circuit, MPC ceremony + VK rotation, fees). Per the spec, each is a
  separate work order; none rides along with the core transplant.

## Everything gated on W5 (held)

1. Fresh program keypair generation (never before W5, never committed)
   + the one-change ID flip (declare_id!, Anchor.toml, SDK env/config
   in deployments, wallet constant, indexer env).
2. Devnet deploy + initialize.
3. The W5 rehearsal script: deposit → withdraw to a fresh address →
   replay the same proof (must abort) → tampered-amount proof (must
   reject) → relayer-submitted withdraw (must succeed, payee unchanged),
   with every tx signature recorded.
4. The W6 devnet integration test (shield→unshield through the SDK only).
5. The W7 on-chain gate (indexer root == Pool.current_root after a
   scripted on-chain deposit sequence).
6. `scripts/deploy-devnet.sh` stays disabled until W5 rewrites it.

## Standing caveats carried into the merged tree

Dev-ceremony VK (MPC ceremony is W8-C and a mainnet precondition);
SBF build unverified (host tests only, same as the donor); transfer is
a fail-closed stub; the merged tree is **not audited** — the re-audit
obligation stands before any "audited" language; whatever binary sits
at the retired Frf98… address on devnet is outside this tree's control
until its upgrade authority closes it.

## Addendum (2026-11-17): SBF stack-frame overflows fixed

The SBF verification build (see the build record above) passed but emitted
5 frame-analysis `Error:` diagnostics, all on the withdraw path, against
the 4,096-byte on-chain frame limit. All 5 are now eliminated with zero
behavior change; a fresh `cargo-build-sbf --tools-version v1.58 --locked`
build exits 0 and its full log greps clean for `frame` / `Error:` /
`overflows` / `overwrites` (baseline log had exactly the 5 diagnostics
below; the toolchain prints frame sizes only for violations, so no
post-fix sizes are emitted — absence of the diagnostics is the pass
signal).

| Function | Before | Cause | Fix |
|---|---|---|---|
| `light_poseidon` `get_poseidon_parameters` (bn254_x5) | 6,336 B (+2,240) | The crate function materializes its 195-element round-constant `ark` as one stack array (`vec![...]`), plus the MDS matrix | Program no longer calls `Poseidon::new_circom`. New `src/poseidon_params.rs` holds the identical width-3 constants (extracted mechanically from light-poseidon 0.2.0's generated `bn254_x5.rs`, t == 3 branch: 195 ark + 9 MDS `BigInteger256` limb quads) as rodata tables and builds the same `PoseidonParameters` (8 full / 57 partial rounds, width 3, alpha 5) on the heap one element at a time via the same `Fr::from(BigInteger256)` conversion. With no caller left, the crate function is dead-stripped from the binary. `poseidon2` now uses `Poseidon::new(circom2_parameters())`. |
| `dark_protocol` withdraw dispatch (`__global::withdraw`) | 4,352 B (+256) + 2× "function call overwrites values in the frame" | The dispatch frame holds the whole `Withdraw` accounts struct, including the 1,765-byte `Pool` inline | `Withdraw.pool` is now `Box<Account<'info, Pool>>` — the pool lives on the heap; the frame holds a pointer. Account semantics and IDL unchanged; handler code untouched (auto-deref). |
| `Withdraw::try_accounts` | 4,224 B (+128) | Same inline `Pool` constructed in this frame | Same boxing fix. |

Verification (all re-run after the fix):

- Program host tests: `cargo +1.89.0 test --lib --locked` — **18/18**,
  including `poseidon2_known_answer_from_light_poseidon_docs` (pins the
  parameter tables bit-for-bit against light-poseidon's own documented
  hash), `deposit_inserts_amount_bound_leaf`, the frontier-vs-reference
  tests at production depth, and both VK tests — all unchanged.
- Merged zk e2e: `node test_withdraw.js` — **13/13** (incl. the NEW-1
  drain checks).
- Client-lib: `npm test` — **34/34**.
- New artifact: `dark_protocol.so` **321,592 B**, sha256
  `e51c2596a38a7cacc78b66f11957e66e4f6a9cb35f1b8ea6feafd15702743789`
  (was 370,592 B / `b9470581…`; the shrink is the dead-stripped parameter
  function, net of the +6,528 B of rodata tables). The baseline was
  reproduced first from the unmodified tree and matched the recorded
  size/hash exactly, so the before/after comparison is on the same
  toolchain and lockfile.
- The auto-generated program keypairs written by both verification
  builds were deleted unread (W5 fresh-keypair doctrine); no deployment,
  no transactions.

This supersedes the "SBF build unverified" caveat above: the merged
program now has a clean SBF build with no frame diagnostics. The other
standing caveats (dev-ceremony VK, transfer stub, not-yet-audited,
retired Frf98… binary) are unchanged.

## Addendum (2026-11-17): open-items register (W5 prep — closes MERGED-NEW-3)

The merged-tree re-audit (`MERGED-REAUDIT.md`, 2026-11-17) found the
transplant and the frame fix introduced no new Critical/High/Medium, and
the tree W5-ready from a code standpoint. This addendum supersedes two
lines of "Standing caveats carried into the merged tree" above: the SBF
build is now **verified** (frame-fix addendum above; deterministic
321,592 B artifact, sha256 `e51c2596…`), and the tree is no longer
"not audited" — it was re-audited 2026-11-17. The remaining open items,
mirrored in `dark-protocol/README.md` § Release Status → Open items:

- **H-1 — key rotation outstanding (dev action, Mac-side).** The 10
  keypairs leaked in the original bundle remain live until the dev
  rotates them from his Mac; deleting files cannot un-leak them.
  Runbook: `dark-protocol/hardening/ROTATION-RUNBOOK.md`; inventory:
  `dark-protocol/hardening/INVENTORY.md`. The codebase side is
  complete — this tree scans clean.
- **REAUDIT NEW-4 (Low) — multisig digest separator collision.**
  `proposalDigest` joins variable-length fields with bare 0x00
  separators and no length prefixes, so distinct (proposalId, action)
  pairs can collide to one digest. Confirmed unchanged in the merged
  tree (client-lib is the donor's code).
- **REAUDIT NEW-5 (Low) — client `Note` value range.** `Note` accepts
  values up to 2¹²⁸ while the circuit and program cap at u64; a wallet
  bug could permanently strand a deposit (self-harm class). Confirmed
  unchanged in the merged tree.
- **REAUDIT NEW-6 (Info) — `_accountNode` exposure.**
  `deriveAccountKeys` returns `_accountNode` (the raw account root
  secret) in its result object; a stray serialization would leak it.
  Confirmed unchanged in the merged tree.
- **REAUDIT NEW-2 (Low) — `createSpendProof` targets the future
  transfer circuit.** Against the landed withdraw artifacts it fails
  closed; the proven v1 path is the withdraw-shaped flow. Unchanged;
  closure is designed in `dark-protocol/docs/w8/transfer-circuit.md`,
  not implemented.
- **MERGED-NEW-2 (Info) — `dark-protocol/zk/keys/ceremony_redo.sh` is
  a historical record, not a runnable procedure.** It carries
  donor-tree absolute paths because it records the NEW-1 ceremony redo
  as it was run. The runnable ceremony kit (`zk/ceremony/` — RUNBOOK.md,
  contribute.sh, verify-transcript.sh, finalize.sh, export_vk.js; built
  and rehearsed end-to-end) exists in the donor tree and has **not**
  been transplanted into this tree; a future ceremony must re-derive
  its paths here rather than copy the record script.
- **Standing caveats.** The verifying key comes from a local
  single-contributor **dev ceremony** — a real MPC ceremony is the
  mainnet gate (W8-C; kit rehearsed, see MERGED-NEW-2 above).
  `transfer` is a **fail-closed stub** (`TransferNotEnabled`). The SBF
  build is verified with the withdraw stack frames fixed (above). The
  merged tree was **re-audited 2026-11-17** (`MERGED-REAUDIT.md`) and
  is W5-ready from a code standpoint; W5 itself awaits the dev's
  separate go. MERGED-NEW-1 (client-lib's default ZK artifact path
  pointed at the donor tree) was closed in this same W5 prep — the
  default now resolves to the merged tree's own
  `dark-protocol/zk/`, and the client-lib (34/34) and SDK (7/7) suites
  were re-run green against it.

## W5 addendum (2026-11-17) — devnet rehearsal run; stopped at initialize

The dev gave the W5 go and the rehearsal was executed the same day.
Full record: `W5-REHEARSAL.md` at the repo root. Summary:

- **ID flip done** — fresh program ID
  `2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL` (keypair generated at
  W5, held outside the tree) at all 7 flip points; placeholder remains
  only in SDK `dist/` (regenerated; SDK 7/7 post-flip) and historical
  records. SBF rebuilt deterministically (321,592 B, sha256
  `61fc920d…`).
- **Deployed to devnet and byte-verified** — deploy tx
  `3viiSggh1zfpfqZoGRdAvqNVAMn1LBBwC66XsuT1jEVnhyEhQFdVaG78SHvMPcHQhsrUygbu7nKoaaKD2Jo7DJ9D`;
  `solana program dump` of the deployed program is hash-identical to
  the in-tree artifact; upgrade authority = the W5 deployer
  (rehearsal custody). Funding came from consolidating on-machine
  devnet test wallets — every public faucet route was closed or
  drained (see the rehearsal record).
- **W5-NEW-1 (Critical) — `initialize` can never execute:** it
  consumes the full compute budget and aborts at the 1.4M CU
  protocol maximum in simulation (60 on-chain Poseidon hashes;
  > ~23K CU/hash in the SBF build). No pool exists; deposit /
  withdraw / replay / tamper / drain / relayer steps and the SDK +
  indexer gates are all blocked on it and were not run. Per the W5
  behavior freeze the defect is recorded (also as an open item in
  `dark-protocol/README.md`), not fixed; the rehearsal resumes from
  initialize after a fix + upgrade/redeploy.
- `scripts/deploy-devnet.sh` was rewritten into the real devnet
  procedure (hard devnet guard, keypairs by path, resumable buffer).
- **Mainnet remains gated** on the real MPC ceremony and the dev's
  separate mainnet decision — and now also on the W5-NEW-1 fix.

## Addendum (2026-11-17, later): W5-NEW-1 fix + upgrade + rehearsal resume

The dev authorized the W5-NEW-1 fix after the rehearsal report. Full
record: the "W5-NEW-1 fix + rehearsal resume" section of
`W5-REHEARSAL.md`. Summary:

- **Fix:** the 21 depth-20 zero-chain values are now constants
  (`programs/dark-protocol/src/zero_chain.rs`, mechanically generated
  from the program's own `poseidon2`, pinned bit-for-bit by a new
  test), and the Merkle fold short-circuits on the exact constant
  pair (`merkle::combine`). Hash counts: initialize 60 → 0, deposit
  41 → 21, withdraw 1 → 1. No value changes: program host suite
  20/20 with the 18 prior tests unmodified (plus the constants test
  and a 40-deposit full-hash equivalence test), client-lib 34/34,
  ZK e2e 13/13.
- **Rebuild + upgrade:** deterministic SBF artifact (323,096 B,
  sha256 `c5733c01…`, zero frame diagnostics) upgraded **in place**
  on devnet (same program ID; ProgramData first extended by 10,240
  bytes — the new binary is 1,504 B larger; upgrade tx
  `4RUbuQ32…`). Deployed bytes verified: the program dump matches
  the artifact on all 323,096 artifact bytes, with 8,736 zero bytes
  of extension slack behind them.
- **Rehearsal resumed:** `initialize` **landed at 25,111 CU**; the
  pool's on-chain root equals the constant table's z[20]. The first
  `deposit` then aborted having consumed the full **1.4M CU**
  protocol maximum in simulation — its remaining 21 hashes price
  the Poseidon evaluation path at > ~65K CU/hash. Per the fix
  brief's stop rule, the rehearsal halts at `deposit`; withdraw /
  replay / tamper / drain / relayer and the SDK + indexer gates
  remain unrun. The remaining fix (per-hash Poseidon cost — hoisted
  parameter construction and/or a leaner evaluation) changes the
  hash path and needs its own authorization, equivalence proof and
  re-audit.
- **Mainnet remains gated** on the real MPC ceremony and the dev's
  separate mainnet decision — and now on the deposit-CU fix as well.

## Addendum (2026-11-17, later still): Poseidon-cost track — W5-NEW-1 fully closed

The follow-on track the W5-NEW-1 fix addendum pointed at has run
and **closed the finding completely**. Summary (full record:
`dark-protocol/docs/POSEIDON-COST.md`; rehearsal record:
`W5-REHEARSAL.md`, final section):

- **Lab decomposition (devnet SBF measurement):** the old
  software Poseidon path cost **> 1.4M CU for a single hash** —
  `circom2_parameters()` construction alone 625,961 CU, one
  permutation > 773,889 CU. Deposit was dying on its first hash;
  the "> ~65K CU/hash" figure in the earlier addendum was only
  the weakest lower bound. Threading parameters per instruction
  (Route A) was measured dead (projected deposit > 16.9M CU).
- **Fix:** `poseidon2` delegates to the native `sol_poseidon`
  syscall (`solana-poseidon = "2.3.13"`, one added lock package);
  poseidon path only — no circuit/VK/client-lib/zero-chain/
  layout/interface change. ~819 CU per hash.
- **Equivalence:** on-devnet differential vs the pre-change
  implementation, 206/206 bit-identical (KAT, full zero chain,
  modulus−1 boundary, 200 randomized canonical pairs; rejection
  domain identical); host 20/20, client-lib 34/34, ZK 13/13,
  all tests unmodified.
- **Upgrade:** in place, tx
  `2Y221pP13758nLxqvbW2JJpGMZpmTHEKZUjMLWxHmv239Zw9Ts4E1UuXfnEZjQaxDX5ExzxwRGjfwyGK3xUL4rHy`;
  artifact 278,040 B, sha256 `97187978…`, zero frame diagnostics,
  dump-verified on all artifact bytes, authority unchanged.
- **Rehearsal completed:** deposits ~34.7K CU; withdraws
  ~125–131K CU; replay, tamper, and the NEW-1 drain attempt all
  rejected on-chain with the designed errors; relayer withdraw
  landed; SDK and indexer gates pass (indexer root == live pool
  root). Final pool: 6 leaves, 7,000,001 deposited / 6,500,000
  withdrawn (lamports).
- **Carried forward, not fixed here:** the vault rent-floor
  finding (a withdraw leaving the vault — or paying a fresh
  recipient — below rent-exemption cannot land; POSEIDON-COST.md
  §8) is a pool-economics item for a future work order. The W8
  hash-budget guidance is in POSEIDON-COST.md §9: on-chain
  hashing is no longer a constraint; Groth16 verifies are.
