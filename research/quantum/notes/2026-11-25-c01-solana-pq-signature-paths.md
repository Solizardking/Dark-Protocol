# Cycle 1 — Solana post-quantum signature paths

- **Worklist item:** #1 (Solana PQ signature paths: Winternitz/hash-based vaults, SIMD work, exposed-pubkey problem in the account model)
- **Date:** 2026-11-25 (America/New_York)
- **Status:** research-only, unreviewed. Not a publication, not an audit, not advice to move funds.
- **Source rule:** primary sources only (SIMDs and their threads, client/vendor repos, NIST, the Solana Foundation and Anza posts). Every claim below carries one label: **established** (stated directly in a primary source or checkable arithmetic from one), **likely** (strong inference from primary sources), **speculative** (an argument, not evidence), **open** (unresolved).

## Headline

**Solana is prepared but not migrated.** No post-quantum signature scheme is live at the protocol level, every ordinary account address *is* an Ed25519 public key, and fee payers cannot be protected by any program-level vault. The only post-quantum protection a Solana user can choose today is opt-in and application-level (a Winternitz one-time-signature vault, or an in-program Falcon-512 verifier). The newest movement is in tooling, not in the account model: SIMD-0579 (a generic Keccak-p1600 syscall that would make hash-based and Falcon-style verification cheaper in programs) reached "all approvals received" on 2026-11-25.

## Findings

| # | Claim | Label | Primary source(s) |
|---|---|---|---|
| F1 | Solana uses elliptic-curve cryptography in four places: the account model (Ed25519), shred authentication in block propagation, Alpenglow consensus (BLS over pairing-friendly curves) and user programs that call EC syscalls. A party able to break Ed25519 could forge transactions and steal funds. | established | Anza, *Securing Solana Against a Powerful Quantum Adversary* (2026-04-27) |
| F2 | **Exposed-pubkey problem.** Ordinary Solana accounts are indexed by the Ed25519 public key itself, so every wallet's public key is on-chain from the first transaction (there is no hash shield like Bitcoin's P2PKH/P2WPKH before first spend). Anza proposes address versioning that indexes new PQ accounts by public-key *hash*, possibly mapped into the off-curve part of the address space. | established (exposure) · open (fix: proposal only) | Anza post (Accounts DB checklist) |
| F3 | Program vaults cannot protect fee payers: vault programs cannot pay transaction fees, so any fee-payer account stays drainable by a quantum adversary until the account model itself changes. | established | Anza post (Migration section) |
| F4 | The Solana Foundation's roadmap is conditional: (1) keep researching and evaluating Falcon and alternatives, (2) if quantum becomes credible, adopt a PQ scheme for new wallets, (3) migrate existing wallets. It says no change is required today. No scheme or date is committed. | established | Solana Foundation, *Solana's Quantum Readiness* (2026-04-27); Anza post disclaimer |
| F5 | Anza and Firedancer independently converged on Falcon (FN-DSA), the smallest-signature NIST scheme (~10x Ed25519), but FN-DSA was still a draft standard when Anza wrote. ML-DSA (FIPS 204) and SLH-DSA (FIPS 205) are final. | established | Solana Foundation post; Anza post; NIST FIPS 204, FIPS 205 |
| F6 | **SIMD-0461** (Falcon-512 verification, refactored from precompile to syscall) was closed unmerged on 2026-06-17. The author paused it because an SBF Falcon implementation already verifies for under 170k CU; maintainers preferred generic building blocks over one-algorithm syscalls. | established | SIMD-0461 PR thread |
| F7 | The Blueshift `solana-falcon512` library verifies Falcon-512 inside a program at ~175k CU (SHAKE256) or ~133k CU (TurboSHAKE256) with a prepared public key, verify-only. It is a library, not an audited protocol feature. | established (figures are the authors' own benchmarks) | blueshift-gg/solana-falcon512 README |
| F8 | **SIMD-0563** (Keccak-p1600 syscall) was closed in favour of **SIMD-0579** (Keccak-p1600 syscall), which on 2026-11-25 received all required approvals and is "ready to merge". It is not merged or activated yet. | established (status on 2026-11-25) | SIMD-0563 and SIMD-0579 PR threads |
| F9 | **Blueshift Winternitz vault** is a lamports vault secured by Winternitz one-time signatures over 224-bit-truncated Keccak-256; each spend closes the vault and splits funds into fresh vaults because each signature reveals ~50% of the one-time key. Its own README warns it is unaudited ("a pretty good dev larping as a cryptographer") and that a keypair-held program upgrade authority still puts funds at risk. | established | blueshift-gg/solana-winternitz-vault README |
| F10 | The 4,096-byte transaction limit (SIMD-0296, delivered in the v1 format of SIMD-0385) is live on mainnet since epoch 1035 (2026-09-15, ~01:00 UTC); legacy and v0 transactions stay at 1,232 bytes. | established | Solana Foundation, *Larger Transaction Sizes*; SIMD-0296, SIMD-0385 (merged 2025-12-17) |
| F11 | Size arithmetic: Falcon-512 (≈666 B sig + 897 B key) and ML-DSA-44 (2,420 B sig + 1,312 B key) fit in one v1 transaction as instruction data; the smallest SLH-DSA signature (7,856 B, SLH-DSA-128s) does not fit even in v1 and would need chunking or account-resident storage. | established (arithmetic from FIPS 204/205 tables and the SIMD-0461 figure for Falcon) | NIST FIPS 204, FIPS 205; SIMD-0461 thread; Larger Transaction Sizes |
| F12 | **Seed-proof migration.** Anza merged an experimental "proof of knowledge of seed" crate (Plonky3 STARK over SHA-512; ~400 KB proof, ~55 ms prove, ~13 ms verify) so an existing Ed25519 address could be bound to a new PQ key without changing the address, following Baldimtsi–Chalkias–Roy (Mysten Labs, 2025). | established | anza-xyz/cryptography PR #10 (merged 2026-04-08); Anza post |
| F13 | The merged prototype is **not yet post-Q-day sound**: its own PR says the `sk_seed → pk` link is enforced with an ordinary Ed25519 signature rather than in-circuit, and the fully sound version (Ed25519 scalar multiplication inside the STARK) "is not practical today". An adversary who can forge Ed25519 could plausibly satisfy that link without the real seed. | likely (the gap is stated by the authors; the attack sketch is our inference) | anza-xyz/cryptography PR #10 description |
| F14 | PQ consensus is unsolved for Alpenglow: PQ signatures lack BLS-style aggregation. Candidate directions are hash-based signatures aggregated by a hash-based SNARK (Ethereum's leanXMSS line) or Falcon aggregation via LaBRADOR, whose post-quantum security analysis is incomplete; Anza notes raw votes could be carried in blocks instead of certificates. | open | Anza post (Toolbox: signatures; Consensus checklist) |
| F15 | Anza's own forecast: a 3–5% chance of an ECDLP-256-breaking quantum computer within five years (up from "negligible"), after 2026 resource estimates of under 1,450 logical qubits / under 500,000 physical qubits on superconducting hardware. | established that Anza says this · speculative as a forecast | Anza post (citing Babbush et al. 2026 and Cain et al. 2026) |
| F16 | Hawk-512 (555-byte signatures) also has an SBF implementation, but a 2026-09-01 comment in the SIMD-0461 thread says "Hawk is broken". We did not find a primary cryptanalysis source for that, so treat Hawk as **unverified, do not use** until a paper or advisory is located. | open | SIMD-0461 thread; blueshift-gg/solana-hawk512 |

## What this means for our stack (research-only)

1. **Treasury, program upgrade authorities and long-lived agent wallets are the exposed surface** (F1, F2). Their public keys are already public; nothing at protocol level can rescue them after a CRQC. Candidate defense: move cold treasury and any upgrade authority behind a hash-based (Winternitz-style) or Falcon-verified vault *program whose own upgrade authority is also PQ-controlled or revoked* (F9). Fee payers stay exposed regardless (F3), so keep fee-payer balances small.
2. **Prefer schemes that fit one v1 transaction** (F10, F11): Falcon-512 or ML-DSA-44 for any in-program PQ authorization; avoid SLH-DSA on-chain.
3. **Track SIMD-0579** (F8): if merged and activated it lowers the CU cost of hash-based and Falcon verification in programs; re-check CU figures then.
4. **Don't treat seed-proof migration as available yet** (F12, F13). Keep seed phrases for all wallets (it is the only post-Q-day migration path being designed), and avoid creating wallets from raw keys with no seed.
5. **Do not adopt Hawk** (F16) until the break report is confirmed or refuted from a primary source.

## Migration triggers to watch (feeds worklist #7 and #8)

- SIMD-0579 merged → feature gate activated.
- Any SIMD for address versioning / PQ account types (none found on 2026-11-25).
- NIST final FN-DSA (FIPS 206) publication.
- A credible public demonstration of ECDLP on curves larger than toy sizes, or Anza/Foundation raising their forecast.

## Sources (opened 2026-11-25)

- Anza — Securing Solana Against a Powerful Quantum Adversary (2026-04-27): https://www.anza.xyz/blog/securing-solana-against-a-powerful-quantum-adversary
- Solana Foundation — Solana's Quantum Readiness (2026-04-27): https://solana.com/news/quantum-readiness
- Solana Foundation — Larger Transaction Sizes: https://solana.com/upgrades/larger-transaction-sizes
- SIMD-0296 Larger Transaction Size: https://github.com/solana-foundation/solana-improvement-documents/pull/296
- SIMD-0385 Transaction V1 Format: https://github.com/solana-foundation/solana-improvement-documents/pull/385
- SIMD-0461 Falcon signature verification syscall: https://github.com/solana-foundation/solana-improvement-documents/pull/461
- SIMD-0563 Keccak-p1600 syscall (closed): https://github.com/solana-foundation/solana-improvement-documents/pull/563
- SIMD-0579 Keccak-p1600 syscall: https://github.com/solana-foundation/solana-improvement-documents/pull/579
- Anza experimental Falcon in solana-sdk (draft): https://github.com/anza-xyz/solana-sdk/pull/537
- Anza ed25519-pokos seed-proof prototype: https://github.com/anza-xyz/cryptography/pull/10
- Blueshift Winternitz vault: https://github.com/blueshift-gg/solana-winternitz-vault
- Blueshift Falcon-512 SBF verifier: https://github.com/blueshift-gg/solana-falcon512
- Blueshift Hawk-512 SBF verifier: https://github.com/blueshift-gg/solana-hawk512
- NIST FIPS 204 (ML-DSA): https://csrc.nist.gov/pubs/fips/204/final
- NIST FIPS 205 (SLH-DSA): https://csrc.nist.gov/pubs/fips/205/final

## Not verified / excluded

- The Babbush et al. and Cain et al. 2026 resource estimates are reported here only as Anza reports them; the papers themselves were not opened this cycle (queued for worklist #3).
- Secondary summaries (news sites, aggregator timelines) were read for orientation only and are not cited.
