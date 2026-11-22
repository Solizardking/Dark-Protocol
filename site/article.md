# Dark Protocol: A Year of Building Private Solana — and the Proof We Ran Out of Fuel to Finish

*Dark Protocol is a zero-knowledge privacy pool for Solana, built by the Dark x402 team. This is the story of what we built, how hard we tried to break it, and the machine-checked proof we started with Harmonic's Aristotle — until the credits ran out. We're looking for a sponsor to help us finish it.*

---

## Why privacy on Solana needs more than a promise

On a public blockchain, every payment leaves a trail anyone can follow forever. Dark Protocol breaks that trail without asking you to trust us: you deposit SOL into a shared pool, hold a private cryptographic note, and later withdraw to a fresh wallet using a zero-knowledge proof that shows "I own a valid note" without revealing which deposit was yours. No public link between the two wallets. No operator who can peek, freeze, or walk off with the funds — there's no operator at all, only code running on Solana that anyone can read.

But a privacy pool is only worth using if its rules can't be bent. It must never pay out more than was deposited. Never accept a forged proof. Never let the same note be spent twice. Never contain a backdoor. "Trust us, we tested it" is not an answer. So over the past year, we set out to earn a better one.

## The year of work

**We started by tearing our own house down.** Our first security audit of the original Dark DeFi codebase returned 39 findings — 6 critical, 8 high — including placeholder cryptography where real zero-knowledge proofs should have been. Rather than patch around it, we ordered a complete rewrite: real Groth16 proofs over BN254, circomlib Poseidon hashing throughout, a depth-20 Merkle tree of notes, and a withdraw circuit of 13,162 constraints.

**Then we attacked the rewrite.** A hostile re-audit found what testing hadn't: a critical flaw (we track it as NEW-1) where the amount in a deposit wasn't cryptographically bound to the note it created. Left in place, a 1-lamport deposit could have been dressed up to drain the pool. We fixed it at the root — the program now computes the bound leaf on-chain, `Poseidon(commitment, amount)`, and the circuit proves membership of exactly that leaf — and added a drain regression test at every layer of the stack so it can never quietly come back.

**Then we rehearsed the whole lifecycle on devnet.** Deposits and withdrawals end to end, including a withdrawal routed through a third-party relayer. A replayed withdrawal: rejected. A proof tampered with by a single lamport: rejected. The NEW-1 drain attack, attempted for real: rejected. The books balanced to the lamport — 7,000,001 lamports deposited across the rehearsal, 6,500,000 withdrawn, the remainder exactly the unspent test notes. Along the way we replaced our Poseidon implementation with Solana's native `sol_poseidon` syscall (~819 compute units per hash, byte-for-byte identical outputs proven on-chain before the swap) and landed final costs of roughly 25k CU to initialize, ~35k CU per deposit, and ~125–131k CU per withdrawal — practical numbers for mainnet. Every test suite passes: 20/20 program, 34/34 client, 13/13 ZK, 7/7 SDK, 3/3 indexer.

**And we prepared the trusted setup properly.** A production Groth16 deployment needs a multi-party ceremony so no single person ever holds the toxic waste that could forge proofs. We imported the Hermez perpetual powers-of-tau at 2^15 and verified it bit-for-bit against its pinned BLAKE2b-512 hash, built and rehearsed the full contributor kit, and drafted the ceremony transcript and contributor materials. The ceremony runs before mainnet. No shortcuts.

## The proof we started — and where it stopped

Testing checks examples. We wanted proof that checks *everything*. So we took Dark Protocol to **Aristotle, Harmonic's formal verification engine**, which translates our Rust program into a mathematical model and proves — or refutes, with a runnable counterexample — properties stated in plain English. We submitted seven:

1. **No undefined behavior, no panics** anywhere in the program.
2. **Conservation of funds** — the pool's ledger always equals the sum of successful deposits minus successful withdrawals; donations can't inflate it.
3. **Withdraw gating** — every check fires in exact order, and a rejected proof never burns a user's note.
4. **Deposit binding** — the NEW-1 property: the amount is sealed to the note, mathematically.
5. **Authority impotence** — the pool's authority field can never be used as a backdoor; there is no admin path to the funds.
6. **Progress** — an honest user with a valid note can always withdraw; the pool can't brick itself.
7. **Root-history integrity** — the Merkle root history contains only roots the program itself produced.

Harmonic's signup grant gave us 500 credits. On November 18, 2026, we fired the run.

**Two hours later, the grant was gone — and the run ended OUT_OF_BUDGET with all seven properties unresolved.** Not proved. Not refuted. No counterexamples — the verifier didn't find our code wrong; it ran out of fuel in the middle of proving it right. Formal verification of real cryptography-adjacent Rust is simply expensive: the prover was working through a ~1,760-line program whose correctness leans on Poseidon and Groth16 verification at its boundary. We also have a second pilot fully packaged and paused — eight properties for the on-chain limit orderbook that will settle Dark Percolator trades — which never got to start.

We publish our status page honestly, and it still says what it said the day we deployed it: *verification in progress*. We're not going to relabel an unfinished proof as a finished one. That's the whole point of doing this in public.

## What we're asking

**We're looking for a sponsor to fund the Aristotle credits to finish the verification we started.**

Based on the burn rate we observed, completing the seven Dark Protocol properties plausibly takes a further $1,000–$2,000 in credits — we'd start with the two highest-value properties (deposit binding and conservation of funds) and publish results as they land: proved, refuted with a counterexample we'll fix, or unresolved with the boundary stated plainly. Sponsors get named credit on the protocol page and in the verification report, early access to the full results package, and the knowledge that mainnet privacy on Solana got its proof because they funded it.

## Why it matters beyond one pool

Dark Protocol is the settlement core of a family we're bringing to Solana mainnet:

- **Confidential compute** — TEE-attested execution where the machine itself proves what it ran.
- **Private AI inference** — Dark x402: model calls that run in the dark and are paid for in the dark, over x402.
- **Private perpetual trading** — Dark Percolator and Dark Perps: positions the whole world doesn't get to front-run.

Every one of those stands on the same foundation: private value movement whose rules are *proven*, not promised. The pool is built. The ceremony is staged. The proofs are specified, packaged, and waiting on credits.

Help us finish what we started.

---

**Follow the work:** [darkx402.com/dark-protocol](https://darkx402.com/dark-protocol) · [protocol.darkx402.com](https://protocol.darkx402.com) · X: [@0rdlibrary](https://x.com/0rdlibrary) · GitHub: [github.com/solizardking](https://github.com/solizardking)

*Status at publication: Dark Protocol is live on Solana devnet only. Mainnet is gated on completion of the MPC ceremony and the formal verification above. Nothing in this article is a claim that verification has completed — yet.*
