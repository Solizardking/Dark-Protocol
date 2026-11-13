<div align="center">

<img src="assets/banner.svg" alt="Dark Protocol" width="900"/>

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blueviolet?style=for-the-badge)](https://anchor-lang.com)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?style=for-the-badge&logo=rust&logoColor=white)](https://rustlang.org)
[![License](https://img.shields.io/badge/License-Apache--2.0-00ff41?style=for-the-badge)](../LICENSE)
[![Network](https://img.shields.io/badge/Devnet-executable-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://orbmarkets.io/address/E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm)
[![Mainnet](https://img.shields.io/badge/Mainnet-not%20deployed-ff6600?style=for-the-badge)](https://orbmarkets.io/address/E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm)
[![npm](https://img.shields.io/badge/npm-%40openclawdsol%2Fdark--protocol--sdk-00ff41?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk)

**Commitment-based note pool on Solana — shield, transfer, and withdraw SOL with on-chain encrypted note payloads.**

[Protocol](#protocol-overview) · [Instructions](#instructions) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Deploy](#deployment) · [Security](#security)

</div>

---

## Protocol Overview

Dark Protocol v1 is an Anchor program for a SOL note pool. The design is inspired by Zcash Sapling note layout: a 32-byte commitment, a 580-byte `enc_ciphertext`, an 80-byte `out_ciphertext`, and a 32-byte ephemeral key. The program stores those bytes. It does not run a prover.

A public RPC read on **13 November 2026** found an upgradeable program account for this id on **devnet** (programdata about 298 KB, upgrade authority `AAqkn72VgkZqFbWggn9SvzjzMRW5zsZrTe5VZKu9DwaM`). **Mainnet has no account at this address.** That read did not compare bytecode to this source tree.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DARK PROTOCOL v1                             │
│                                                                     │
│   User Wallet                                                       │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────┐   deposit(amount, commitment, enc_ct, out_ct, eph_key) │
│  │Depositor│──────────────────────────────────────────────────────► │
│  └─────────┘                                                        │
│                    ┌─────────────────────┐                          │
│                    │    Pool Vault PDA   │  ◄── SOL custody         │
│                    └─────────────────────┘                          │
│                    ┌─────────────────────┐                          │
│                    │   ShieldedNote PDA  │  ◄── note account        │
│                    │  commitment: [u8;32]│      (790 bytes)         │
│                    │  enc_ct:  [u8;580]  │                          │
│                    │  out_ct:  [u8;80]   │                          │
│                    │  eph_key: [u8;32]   │                          │
│                    │  amount:  u64       │  ◄── stored in the clear │
│                    │  depositor: Pubkey  │  ◄── stored in the clear │
│                    └─────────────────────┘                          │
│                                                                     │
│  shielded_transfer ──► spend note, emit 2 new notes (no SOL move)  │
│  withdraw          ──► mark spent, SOL exits vault                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Program ID:** `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm`

Account link: [Orb](https://orbmarkets.io/address/E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm). Orb indexes mainnet, so this devnet-only address will not show a program there.

Clients:

```bash
npm install @openclawdsol/dark-protocol-sdk
npm install @openclawdsol/dark-tee-agents
npm install @openclawdsol/dark-protocol
```

| Package | Version in this repo | What it is |
| --- | --- | --- |
| [`@openclawdsol/dark-protocol-sdk`](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk) | 0.3.1 | Shielded wallet, Sapling HD keys, note encryption, Jupiter swap helper |
| [`@openclawdsol/dark-tee-agents`](https://www.npmjs.com/package/@openclawdsol/dark-tee-agents) | 0.1.0 | `ClawdTeeAgent`, SAS helpers, x402 payment types |
| [`@openclawdsol/dark-protocol`](https://www.npmjs.com/package/@openclawdsol/dark-protocol) | 0.2.0 | Low-level client and program ids |
| [`dark-defi`](https://www.npmjs.com/package/dark-defi) | 0.2.1 | Umbrella re-export |

---

## Instructions

### `initialize`

Bootstrap the global `ProtocolState` PDA and the native SOL pool vault.

| Account | Role |
| --- | --- |
| `protocol_state` | PDA `["protocol"]` — authority, note counter, bumps |
| `pool_vault` | PDA `["pool_vault", protocol_state]` — SOL custody |
| `payer` | pays rent and becomes irrelevant after init; `authority` is an instruction argument |

```typescript
await program.methods
  .initialize(authority)
  .accounts({ protocolState, poolVault, payer, systemProgram })
  .rpc();
```

---

### `deposit`

Move SOL from the depositor into the vault and create a `ShieldedNote` PDA keyed by the client-supplied commitment.

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `u64` | Lamports to move. Must be greater than 0. Stored on the note in the clear. |
| `commitment` | `[u8; 32]` | Client-supplied 32 bytes. The program does not open it. |
| `enc_ciphertext` | `[u8; 580]` | Stored as Sapling-sized `enc_ciphertext`. Not decrypted on-chain. |
| `out_ciphertext` | `[u8; 80]` | Stored as Sapling-sized `out_ciphertext`. |
| `ephemeral_key` | `[u8; 32]` | Stored ephemeral public key. |

```typescript
await program.methods
  .deposit(amount, commitment, encCiphertext, outCiphertext, ephemeralKey)
  .accounts({ protocolState, shieldedNote, poolVault, depositor, systemProgram })
  .rpc();
```

Emits: `NoteDeposited { commitment, amount, note_index, slot }`

The event publishes `amount`.

---

### `withdraw`

Mark a note spent, record a nullifier PDA, and send `amount` lamports from the vault to `recipient`.

| Parameter | Type | Description |
| --- | --- | --- |
| `nullifier` | `[u8; 32]` | Any unused 32 bytes. The program stores them. It does not check a PRF. |
| `amount` | `u64` | Must equal the note's stored `amount`. |

```typescript
await program.methods
  .withdraw(nullifier, amount)
  .accounts({ protocolState, shieldedNote, nullifierRecord, poolVault, recipient, systemProgram })
  .rpc();
```

Emits: `NoteWithdrawn { nullifier, amount, slot }`

`recipient` is the signer who pays to create the nullifier account and who receives the SOL. The program does not require `recipient` to be the depositor, and it does not require knowledge of a spending key.

---

### `shielded_transfer`

Mark one input note spent and create two output notes. SOL stays in the vault. `amount_1 + amount_2` must equal the input note's stored amount.

| Parameter | Type | Description |
| --- | --- | --- |
| `input_nullifier` | `[u8; 32]` | Stored on a new nullifier PDA. Not checked against the note. |
| `output_commitment_1/2` | `[u8; 32]` | Seeds for the two new note PDAs. |
| `enc_ciphertext_1/2` | `[u8; 580]` | Stored ciphertexts. |
| `out_ciphertext_1/2` | `[u8; 80]` | Stored out-ciphertexts. |
| `ephemeral_key_1/2` | `[u8; 32]` | Stored ephemeral keys. |
| `amount_1` | `u64` | Payment amount, stored in the clear on output note 1 and in the event. |
| `amount_2` | `u64` | Change amount, stored in the clear on output note 2 and in the event. |

`sender` is a signer and is written into both output notes as `depositor`. The program does not check that `sender` owns the input note.

Emits: `NoteTransferred { input_nullifier, output_commitment_1, output_commitment_2, amount_1, amount_2 }`

---

## Architecture

### Account Layout

```
ProtocolState PDA  ["protocol"]                          50 bytes
├── authority:   Pubkey                                  32
├── note_count:  u64                                      8
├── bump:        u8                                       1
└── vault_bump:  u8                                       1

ShieldedNote PDA  ["note", commitment]                  790 bytes
├── commitment:    [u8; 32]                              32
├── enc_ciphertext [u8; 580]                             580
├── out_ciphertext [u8; 80]                               80
├── ephemeral_key  [u8; 32]                               32
├── amount:        u64                                    8   public
├── spent:         bool                                   1   public
├── note_index:    u64                                    8
├── slot:          u64                                    8
├── depositor:     Pubkey                                32   public
└── bump:          u8                                     1

NullifierRecord PDA  ["nullifier", nullifier]            49 bytes
├── nullifier: [u8; 32]                                  32
├── slot:      u64                                        8
└── bump:      u8                                         1

Pool Vault PDA  ["pool_vault", protocol_state]
└── Native SOL account (no data)
```

`ShieldedNote::LEN` includes the 8-byte Anchor discriminator, so the allocated account is 790 bytes. `ProtocolState::LEN` and `NullifierRecord::LEN` include that discriminator as well (50 and 49).

### Note Lifecycle

```
                     ┌──────────────────┐
                     │  Unspent Note    │
   deposit() ───────►│  spent = false   │
                     └────────┬─────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
     withdraw()                    shielded_transfer()
     nullifier stored              nullifier stored
     SOL exits vault               2 new notes created
              │                               │
              ▼                               ▼
     ┌─────────────────┐           ┌──────────────────────┐
     │  Note spent=true │          │  Note spent=true      │
     │  NullifierRecord │          │  NullifierRecord       │
     │  SOL → recipient │          │  OutputNote1           │
     └─────────────────┘          │  OutputNote2           │
                                   └──────────────────────┘
```

### What is actually hidden

The program copies `enc_ciphertext`, `out_ciphertext`, and `ephemeral_key` onto the account and never reads them. A client that encrypts with ChaCha20-Poly1305 can hide a memo from someone who does not have the key.

These values are public on the account and in events:

- `amount`
- `depositor` (the signer of `deposit` or `shielded_transfer`)
- `spent`, `note_index`, `slot`
- the commitment and the nullifier bytes once they are submitted

The Merkle root is not stored on-chain. `lib.rs` says the SDK keeps it off-chain. There is no on-chain inclusion proof.

---

## Quick Start

### Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Node deps
yarn install
```

### Build

```bash
anchor build
```

### Test (localnet)

```bash
anchor test
```

### Run localnet manually

```bash
solana-test-validator &
anchor deploy
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

TypeScript clients use the published packages, not the names `@dark-protocol/sdk` or `@dark-protocol/tee-agents`:

```bash
npm install @openclawdsol/dark-protocol-sdk @openclawdsol/dark-protocol @openclawdsol/dark-tee-agents
```

---

## Deployment

### Devnet

```bash
./deploy-devnet.sh
```

The script checks balance, builds, and deploys. An upgradeable program account already exists at the declared id on devnet. Confirm you hold upgrade authority `AAqkn72VgkZqFbWggn9SvzjzMRW5zsZrTe5VZKu9DwaM` before upgrading it.

### Mainnet

```bash
./deploy-mainnet.sh
```

There is no mainnet program at `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm`. Do not deploy this unaudited v1 to mainnet to hold real funds. The script expects a funded wallet at `~/.config/solana/id.json` and about 2–3 SOL of rent if you are only testing a throwaway deployment you can abandon.

### Configuration (`Anchor.toml`)

```toml
[programs.localnet]
dark_protocol_program = "E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"

[provider]
cluster = "localnet"
wallet   = "~/.config/solana/id.json"
```

The manifest does not list a devnet or mainnet override. `declare_id!` is the same address.

### Legacy ids

Do not point new clients at these. Their program-id keypairs were committed in an earlier revision of `docs/reference/PROGRAM_INFO.md` and must be treated as public.

| Legacy program | Id | Devnet on 13 Nov 2026 | Mainnet on 13 Nov 2026 |
| --- | --- | --- | --- |
| dark-protocol | `3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC` | Executable. Upgrade authority `5m8qxm4j75VQCv34oUThE5QNbKJG7KHfd85NdK4dVagS` | System-owned account, 80 bytes, not a program |
| shielded-wallet | `4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg` | Executable. Same upgrade authority | No account |

`PROGRAM_INFO.md` records that upgrade-authority keypair as unaccounted-for.

---

## Security

### What the program enforces

| Behavior | What the code does |
| --- | --- |
| Positive deposits | `amount > 0`, or `ZeroAmount` |
| Same note spent twice | `spent` flag, or `NoteAlreadySpent` |
| Amount split | withdraw requires `amount == note.amount`. Transfer requires `amount_1 + amount_2 == note.amount`, with checked add |
| Nullifier byte reuse | creating the nullifier PDA fails if that exact seed already exists |
| Overflow | `note_count` uses `checked_add` |

### What v1 does not enforce

- No zero-knowledge proof. A commitment is not opened on-chain. A nullifier is not tied to a spending key.
- `withdraw` pays the signer who submits it. Any caller who can see the public `amount` and supply an unused nullifier can take the note's SOL from the vault.
- `shielded_transfer` lets the transaction signer mark an unspent note spent and write two new notes. It does not prove the signer holds the input note.
- Amounts, depositors, and event values are public. Ciphertext opacity is not amount privacy.
- No on-chain Merkle root and no inclusion proof.
- Ciphertext lengths are fixed at 580 and 80 bytes. Other note formats will not fit.
- Unaudited. Alpha. Do not put real funds in this program.

The TypeScript SDK documents the same gap in another form: Jubjub operations are a hash approximation, Groth16 proofs are placeholders, and the packages are not an audited custody system. `local-dev` quotes from `@openclawdsol/dark-tee-agents` are self-signed. They are not Intel TDX, AMD SEV-SNP, or SGX evidence.

### Audit Status

v1 is unaudited. Do not use it on mainnet with real funds.

---

## Project Structure

```
dark-protocol-program/
├── programs/
│   └── dark-protocol-program/
│       └── src/
│           └── lib.rs          ← program logic (single-file)
├── tests/
│   └── dark-protocol-program.ts
├── assets/
│   └── banner.svg              ← animated header
├── migrations/
├── deploy-devnet.sh
├── deploy-mainnet.sh
├── Anchor.toml
├── Cargo.toml
└── package.json
```

---

## Events

Subscribe via Anchor's `addEventListener` to track protocol activity. Amounts in these events are public.

```typescript
program.addEventListener("NoteDeposited", (event) => {
  console.log("New note:", event.noteIndex, "amount:", event.amount.toString());
});

program.addEventListener("NoteWithdrawn", (event) => {
  console.log("Nullifier recorded:", Buffer.from(event.nullifier).toString("hex"));
});

program.addEventListener("NoteTransferred", (event) => {
  console.log("Note split: payment", event.amount1.toString(), "change", event.amount2.toString());
});
```

---

## Error Codes

| Code | Name | Message |
| --- | --- | --- |
| 6000 | `ZeroAmount` | Amount must be greater than zero |
| 6001 | `NoteAlreadySpent` | Note has already been spent |
| 6002 | `AmountMismatch` | Amount does not match note value |
| 6003 | `NoteOverflow` | Note count overflow |

---

<div align="center">

Built on [Solana](https://solana.com) · Powered by [Anchor](https://www.anchor-lang.com) · Note layout follows the [Zcash Sapling](https://zcash.github.io/orchard/) sizes · Clients on [npm `@openclawdsol`](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk)

</div>
