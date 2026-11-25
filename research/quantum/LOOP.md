# Quantum-defense research loop

**This file is the source of truth for the recurring research routine.** A weekday 11 AM (America/New_York) routine reads it, runs exactly one cycle (the item marked `NEXT`), and updates it. Do not reorder the worklist without dev's say-so.

## Scope

Post-quantum (Shor and Grover) and "P = NP" stress-test threats, and defenses, for blockchains (Solana first; Bitcoin, Ethereum and Zcash where relevant) and for our own stack: Dark Protocol (shielded pool, Groth16/BN254 withdraw proofs, Poseidon commitments), the TEE wallet / gateway and TEE agents, x402 payments, $CLAWD, agent wallets and treasury keys. Research-only.

## Rules every cycle follows

1. **Primary sources only** for anything cited as a finding: BIPs, SIMDs, EIPs/ERCs, ZIPs, NIST FIPS / IR / SP, peer-reviewed papers or IACR ePrint, and the protocol teams' own posts and repos. News, aggregator and vendor-marketing pages may orient the search but are never cited.
2. **Every claim carries exactly one label:** `established` (stated in a primary source, or checkable arithmetic from one), `likely` (strong inference from primary sources), `speculative` (an argument, not evidence), `open` (unresolved). Never upgrade a label without a new source.
3. **Never invent a URL.** Open every source before citing it; run `node site/scripts/check-quantum-sources.mjs` and fix or remove anything that does not resolve (HTTP 429 from solana.com is rate limiting; re-check by hand).
4. **Dedupe** against `entries.json` (by topic and source URL) before adding. Update an existing entry's `label`/`maturity` instead of duplicating it, and say what changed in the note.
5. **Research-only:** no deploys, no merges, no posting to X or the clawdcompute.us research board, no fund movement, no secrets. Open or update a PR on `Solizardking/Dark-Protocol` and stop.

## Worklist (in order)

| # | Topic | Status |
|---|---|---|
| 1 | Solana PQ signature paths: Winternitz / hash-based vaults, SIMD work, the exposed-pubkey problem in the account model | DONE 2026-11-25 — `notes/2026-11-25-c01-solana-pq-signature-paths.md` |
| 2 | Bitcoin PQ migration: BIP-360, hash-based schemes, BTC sitting in vulnerable (exposed-pubkey) outputs | **NEXT** |
| 3 | Quantum timelines: CRQC resource requirements (open the Babbush et al. 2026 and Cain et al. 2026 papers themselves), harvest-now-decrypt-later risk | todo |
| 4 | Grover-side effects: proof-of-work, Proof of History, address hashing, Poseidon/BN254-field hash margins | todo |
| 5 | P = NP survivors: information-theoretic schemes, sequential hardness (VDFs, PoH; claim C4), TEEs | todo |
| 6 | ZK soundness under both threats (Groth16/BN254 vs hash-based STARK/FRI; zero-knowledge vs soundness) | todo |
| 7 | Our stack's exposure: $CLAWD, agent wallets, x402, treasury long-lived addresses, migration triggers | todo |
| 8 | Migration mechanics and governance, including the dormant-coin dilemma (BIP-361 line, Solana seed-proof migration) | todo |
| 9 | Challenge round on claims C1–C8 from the brief (`claims.json`) | todo |

After #9, start a **refresh pass** from #1: re-check each topic for new SIMDs/BIPs/EIPs/NIST documents/papers since its last date, update labels and maturity, and append a dated "Refresh" section to the existing note rather than writing a new one.

## What one cycle does

1. Read this file; take the `NEXT` item. Read `entries.json`, `claims.json` and earlier notes so you don't repeat them. Do not publish a stack-exposure inventory: no inventory table on the page, and no `inventory.json` in this repository.
2. Search for new material since the last cycle date: NIST CSRC publications; SIMD PRs (`solana-foundation/solana-improvement-documents`, search quantum/falcon/keccak/pq/address); BIPs and bitcoin-dev mailing-list threads; EIPs and ethresear.ch posts by protocol researchers; ZIPs; IACR ePrint; CVEs/advisories touching primitives cited in prior entries and notes.
3. Write `notes/YYYY-MM-DD-cNN-<slug>.md` with: headline, a findings table (claim · label · primary source), "what this means for our stack", migration triggers, a dated source list, and a "not verified / excluded" section.
4. Add one `entries.json` object per finding (`id` = `cNN-fNN`; fields: `cycle`, `worklist_item`, `date`, `title`, `label`, `threat`, `primitives`, `stack_components`, `defense`, `maturity` ∈ {deployed, merged, prototype, proposal, paused, research, none}, `sources` [{title, url}], `note`). For #9, set each claim's `challenge_status` and, if warranted, its `label`, with sources.
5. Regenerate the page: `node site/scripts/build-quantum.mjs`, then `cd site && npm run check` (lint + tests must pass).
6. Update this file: mark the item `DONE <date> — <note path>`, mark the next item `NEXT`, and add one line to the log below.
7. Commit on a branch `research/quantum-cNN-<slug>`, open a PR (or push to the open quantum PR if one is still unmerged), and report: the headline finding, PR link, check status, and anything that needs dev's decision. Do not merge or deploy.

## Log

- 2026-11-25 — cycle 1 (#1 Solana PQ signature paths). Headline: Solana is prepared, not migrated: no protocol-level PQ signatures, every address is an exposed Ed25519 key, fee payers can't be vaulted; SIMD-0461 paused, SIMD-0579 (Keccak-p1600 syscall) reached all approvals on 2026-11-25. 12 entries, C1–C8 mirrored. The stack inventory is not published.
