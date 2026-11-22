# DRAFT — DO NOT PUBLISH (prepared 2026-11-18; publication is a separate, explicit step)

# Dark Protocol — Production Trusted Setup Ceremony: Pre-Announcement

Dark Protocol is a shielded pool on Solana: real Groth16 proofs over BN254, a
Merkle-tree note scheme, and an on-chain verifier — live and fully rehearsed
on devnet today. The one thing standing between the devnet program and any
mainnet conversation is the provenance of its proving keys. The keys on
devnet come from a local, single-contributor development setup. That is fine
for rehearsal. It is not fine for production, and we are replacing them in
public, with a multi-party ceremony.

## What is being set up

- **Circuit:** the withdraw circuit (`withdraw.circom`, 13,162 constraints,
  4 public inputs). Frozen for the duration of the ceremony — its r1cs
  sha256 is `a446c630044aa7ea5472762e15824d80ef9ba52238a189b6b27149f61d75cab4`,
  and it is recorded in the ceremony transcript.
- **Phase 1 (already settled):** the Hermez perpetual Powers of Tau file
  `powersOfTau28_hez_final_15.ptau` — 54 independent contributions plus a
  public randomness beacon, the same phase-1 artefact used across the Circom
  ecosystem. Its BLAKE2b-512 is pinned in the transcript header
  (`982372c8…ae6e`) and anyone can verify the file against it.
- **Phase 2 (this ceremony):** five sequential contributions to the
  circuit-specific proving key. Groth16 needs only **one** honest
  contributor who destroys their entropy for the setup to be sound — five
  independent contributors is our credibility bar, not the cryptographic
  minimum.
- **Beacon:** after contributions close, the key is finalized with a
  pre-announced **drand mainnet round** (round number committed in the
  transcript before contributions open; output lands after they close;
  2^10 iterations). Nobody — including us — can predict or influence it.

## Contributor slots

- **C1** — **8bit**, the Dark Protocol developer, on his own machine. **Filled.** (Contributor labels are public handles — no legal names are used in this ceremony.)
- **C2** — independent Solana/ZK developer. **Open — volunteer.**
- **C3** — external security researcher / auditor. **Open — volunteer.**
- **C4** — independent developer, different organisation than C2/C3. **Open — volunteer.**
- **C5** — public community contributor. **Open — volunteer.**

Contributing takes ~30–60 minutes on your own machine, inside a 24–48 hour
window when your turn comes. You verify the incoming key yourself, add
entropy through an interactive prompt (never on a command line), publish
your contribution hash, and destroy your entropy. A self-contained
contributor packet ships with the invitation — no ceremony experience
assumed. If you want a slot, reply _[contact channel TBD]_ with who you are
and which slot you are volunteering for.

Independent **verifiers** are also wanted: you don't contribute, you run the
transcript-verification script over the finished chain and say publicly
whether it checks out. A ceremony is only as credible as its independent
verifications.

## Where the record lives

The full transcript — phase-1 provenance and hashes, every contribution hash
in order with contributor names and key hashes, the beacon record, and the
independent verifications — will be published at _[transcript URL TBD]_ and
updated hop by hop as the ceremony runs, not in a batch at the end. The
invalidation rules are in the transcript too: any failed verification, any
hash mismatch, or a beacon other than the pre-announced round kills the
ceremony, and the transcript will say so rather than disappear.

After finalization, the new verifying key replaces the dev key only through
a test-gated splice (full test suites on the spliced tree), and the
production keys get their own devnet rehearsal — deposit, withdraw, and the
negative tests — before any mainnet decision. That decision is separate,
and it hasn't been made yet.

— DRAFT ENDS. Bracketed TBDs (contact channel, transcript URL, drand round)
are filled at publication time, on the dev's explicit go.
