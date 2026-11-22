# Dark Protocol v2 — settlement program

Groth16-verified shielded SOL pool on Solana (Anchor 0.32, BN254 +
circomlib Poseidon). Rewrite of the v1 `dark-protocol-program` audited in
`~/workspace/dark-defi-audit/AUDIT.md` (finding C-1: it verified nothing).
See `FINDINGS-MAP.md` for the finding-by-finding disposition.

## Status

- Program logic complete; host unit tests cover the state machine
  (Merkle frontier vs an independent reference implementation, root-history
  ring, withdraw state checks, VK constant integrity, proof-A negation,
  recipient encoding, and the NEW-1 bound-leaf deposit test).
- **The verifying key in `src/vk.rs` is the REAL withdraw-circuit key**
  (`VK_IS_PLACEHOLDER = false`), generated from the ZK track's ceremony
  output by its own export scripts and verified byte-identical against
  `zk/vk_solana.bin`. It comes from a LOCAL, SINGLE-CONTRIBUTOR dev
  ceremony — re-run 2026-11-17 for the NEW-1 circuit change — so it is
  suitable for development/devnet only; production requires an MPC
  ceremony and a fresh VK. `Pool.vk_is_placeholder` mirrors the key
  status on-chain. Verification is never faked.
- `transfer` is a fail-closed stub pending the transfer circuit spec.
- The program id is a hash-derived placeholder with no keypair; generate a
  fresh program keypair and replace `declare_id!` before deploying.
- Nothing here is deployed. No transactions have been sent.

## Contract with the ZK track

- `nk = Poseidon(sk, 0)`, `owner_id = Poseidon(sk, 1)`,
  `cm = Poseidon(owner_id, value, blinding)`, `nf = Poseidon(nk, leaf_index)`.
- Merkle depth 20; leaf = `Poseidon(cm, amount)` — the deposit-bound leaf
  (re-audit NEW-1): `deposit` computes it on-chain from the lamports
  pulled, and the circuit proves membership of the same bound leaf, so a
  note is spendable only for exactly its deposited amount;
  node = `Poseidon(left, right)`;
  zeros `z[0] = 0`, `z[i+1] = Poseidon(z[i], z[i])`; empty root = `z[20]`.
- Withdraw public inputs, in order: `root, nf, recipient, amount`.
  V1: full-note spend (`value == amount` proven in-circuit).
- `recipient` encoding **v1**: pubkey split into two 16-byte big-endian
  limbs `hi`, `lo`; `recipient = Poseidon(hi, lo)`. The program computes
  this from the recipient account itself. Verified to match the ZK
  track's `zk/circuits/withdraw.circom` and `zk/scripts/darknote.js`
  exactly.
- Proof format: 256 bytes `A(64) ‖ B(128) ‖ C(64)`, groth16-solana /
  snarkjs big-endian layout. The program negates A internally.

## Instructions

| Instruction | Effect |
| --- | --- |
| `initialize` | Create Pool + vault PDAs; signer becomes (powerless-in-v1) authority. |
| `deposit(amount, cm)` | Pull `amount` lamports into the vault; insert the bound leaf `Poseidon(cm, amount)` as next leaf; rotate root into history. |
| `withdraw(proof, root, nf, amount)` | Verify proof over `[root, nf, recipient, amount]`; create nullifier PDA `["nf", nf]` (replay aborts); pay recipient from vault. Relayer-friendly: recipient need not sign. |
| `transfer(...)` | Always errors `TransferNotEnabled` in v1. |

## Build / test

```bash
cargo +1.89.0 test        # host unit tests
cargo +1.89.0 check       # host check
# SBF: cargo +1.89.0-sbpf-solana-v1.54 build --target sbpf-solana-solana --release
```
