<div align="center">

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Share+Tech+Mono&size=18&duration=2800&pause=900&color=00FF41&center=true&vCenter=true&width=760&lines=Solana+settles.+TEEs+compute.+Digests+only.;Shielded+notes+on+devnet.+Mainnet+is+not+deployed.;Don%27t+trust+the+machine.+Verify+the+proof.;Alpha+software.+Unaudited.+No+real+funds.)](https://github.com/Solizardking/Dark-Protocol)

<img src="dark-protocol-program/assets/banner.svg" alt="Dark Protocol" width="900"/>

[![npm](https://img.shields.io/npm/v/@openclawdsol/dark-protocol-sdk?color=00ff41&label=%40openclawdsol%2Fdark-protocol-sdk&logo=npm&logoColor=white&style=for-the-badge)](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk)
[![npm](https://img.shields.io/npm/v/@openclawdsol/dark-tee-agents?color=9945FF&label=%40openclawdsol%2Fdark-tee-agents&logo=npm&logoColor=white&style=for-the-badge)](https://www.npmjs.com/package/@openclawdsol/dark-tee-agents)
[![npm](https://img.shields.io/npm/v/@openclawdsol/dark-protocol?color=ff00ff&label=%40openclawdsol%2Fdark-protocol&logo=npm&logoColor=white&style=for-the-badge)](https://www.npmjs.com/package/@openclawdsol/dark-protocol)

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blueviolet?style=for-the-badge)](https://www.anchor-lang.com)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-00ff41?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Alpha-ff6600?style=for-the-badge)](SECURITY.md)
[![Devnet](https://img.shields.io/badge/Note%20pool-devnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://orbmarkets.io/address/E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm)

**Solana settles. TEEs compute. Digests only.**

A note pool, a TypeScript wallet SDK, and a TEE-agent package.
The note pool is alpha. It is not a private mainnet bank.

[Note pool](dark-protocol-program/README.md) · [Programs](#programs) · [npm](#npm) · [Clawd](#clawd) · [Security](#security)

</div>

---

```
╔══════════════════════════════════════════════════════════════════╗
║  "Privacy is necessary for an open society in the electronic    ║
║   age. We cannot expect governments, corporations, or other     ║
║   large, faceless organizations to grant us privacy...          ║
║   We must defend our own privacy if we expect to have any."     ║
║                           — A Cypherpunk's Manifesto, 1993      ║
╚══════════════════════════════════════════════════════════════════╝
```

Dark Protocol is the Solana-side workspace for that idea: a shielded-note
program, Sapling-shaped keys in TypeScript, and an agent package that can
attach a Solana Attestation Service credential to a quote.

The quote has to be the quote you actually verified. A `local-dev` signature
is not a TEE. A stored ciphertext is not a hidden balance when `amount` sits
beside it in the clear. This README names the programs and packages that are
in the tree, and the cluster status read from public RPC on **13 November 2026**.

---

## Programs

The current note pool is one program. The shielded wallet is not a second id.

| Role | Address | Devnet | Mainnet |
| --- | --- | --- | --- |
| Note pool `dark_protocol_program` | [`E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm`](https://orbmarkets.io/address/E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm) | Executable upgradeable program. Authority `AAqkn72VgkZqFbWggn9SvzjzMRW5zsZrTe5VZKu9DwaM` | No account |
| Solana Attestation Service (vendored) | [`22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`](https://orbmarkets.io/address/22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG) | Executable | Executable |
| `clawd_stake` | [`5bp3bDnWYdjiYyB99XWWi6h8ga2wnB1TxuRUb4VNJrTn`](https://orbmarkets.io/address/5bp3bDnWYdjiYyB99XWWi6h8ga2wnB1TxuRUb4VNJrTn) | Executable | No account |
| `agent_minter` | [`agnmDKzZkv63sRhPFvm3iWpxaopgTRcohXA6CSYSXvQ`](https://orbmarkets.io/address/agnmDKzZkv63sRhPFvm3iWpxaopgTRcohXA6CSYSXvQ) | Executable | Executable |
| `solana_gpt_oracle` | [`LLMrieZMpbJFwN52WgmBNMxYojrpRVYXdC1RCweEbab`](https://orbmarkets.io/address/LLMrieZMpbJFwN52WgmBNMxYojrpRVYXdC1RCweEbab) | Executable | Executable |
| `mpl_core_nft_staking` | [`7AFH2R2vAowRbYxLJnS5eRazZxQyHcMD9VTJKEFsjpdZ`](https://orbmarkets.io/address/7AFH2R2vAowRbYxLJnS5eRazZxQyHcMD9VTJKEFsjpdZ) | Executable | No account |
| `solana_ai_inference` | `3xFBRCtk5hxeLWzHvwyDg2B67RHoA9JFTKmHPzzccBVc` | No account | No account |
| `token_launcher` | `funvWGBmpr8N7pTNqpxkWPgWnQbL3Yr5vzCHNJT2YkL` | No account | No account |

"Executable" means the account is owned by the upgradeable loader. It does not
mean the deployed bytes were diffed against this commit, and it does not mean
the program is safe to custody funds.

### Retired ids

These devnet programs are still executable. Their program-id keypairs were
published in an older `docs/reference/PROGRAM_INFO.md`. Do not build new
transactions against them.

| Legacy | Address | Why it is retired |
| --- | --- | --- |
| dark-protocol | `3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC` | Published program-id keypair. Devnet upgrade authority `5m8qxm4j75VQCv34oUThE5QNbKJG7KHfd85NdK4dVagS`, recorded in-repo as unaccounted-for. On mainnet this address is a system account, not a program. |
| shielded-wallet | `4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg` | Same class of leak. Same devnet upgrade authority. No mainnet account. |

CLAWD-TEE proof storage lives in a separate repository,
[Solizardking/clawd-tee](https://github.com/Solizardking/clawd-tee)
(public cut: [Solizardking/tea](https://github.com/Solizardking/tea)).
The IDL and gateway default program id is
`BnoUSPTE88ebzLb74RAnTogddDMzyBPtkmKxiRoRJG4L`.
The same 13 November 2026 RPC read found no account for it on devnet or mainnet.

---

## npm

Published names. The old `@dark-protocol/sdk` and `@dark-protocol/tee-agents`
import paths are not the packages in this repo.

```bash
npm install @openclawdsol/dark-protocol-sdk
npm install @openclawdsol/dark-tee-agents
npm install @openclawdsol/dark-protocol
```

| Package | Version | Path | Job |
| --- | --- | --- | --- |
| [`@openclawdsol/dark-protocol-sdk`](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk) | 0.3.1 | `packages/sdk` | `ShieldedWallet`, Sapling HD keys, note encryption, Jupiter swap helper, price oracle |
| [`@openclawdsol/dark-tee-agents`](https://www.npmjs.com/package/@openclawdsol/dark-tee-agents) | 0.1.0 | `packages/tee-agents` | `ClawdTeeAgent`, SAS credential helpers, x402 payment types |
| [`@openclawdsol/dark-protocol`](https://www.npmjs.com/package/@openclawdsol/dark-protocol) | 0.2.0 | `packages/protocol` | Low-level client, program-id map |
| [`dark-defi`](https://www.npmjs.com/package/dark-defi) | 0.2.1 | `packages/dark-defi` | Umbrella re-export |
| `sas-lib` | 1.0.11 | `packages/sas-lib` | Local workspace. Not the npm name to install for SAS itself |
| `dark-x402-terminal` | 1.0.0 | `packages/terminal` | Interactive CLI |

```typescript
import { ShieldedWallet, SaplingUtils } from "@openclawdsol/dark-protocol-sdk";

const { wallet, mnemonic } = await SaplingUtils.generateWallet();
console.log(wallet.getDefaultAddress().toBase58());

// demoMode does not submit a mainnet transaction.
const shielded = await ShieldedWallet.create({ network: "devnet", demoMode: true });
```

`SaplingUtils` derives keys in TypeScript. The note-pool program does not
verify those keys. Placeholder Groth16 proofs and the hash-approximated Jubjub
math are called out in the SDK security notes. Treat devnet and `demoMode` as
the supported surfaces.

---

## Note pool

Full instruction layout, account sizes, events, and error codes:
[`dark-protocol-program/README.md`](dark-protocol-program/README.md).

```
deposit(amount, commitment, enc_ct, out_ct, eph_key)
        │
        ▼
   Pool vault PDA holds the SOL
   ShieldedNote PDA stores the ciphertext AND the amount AND the depositor
        │
        ├── withdraw(nullifier, amount) → SOL to the signer
        └── shielded_transfer(...)      → two new notes, SOL stays in the vault
```

`initialize`, `deposit`, `withdraw`, and `shielded_transfer` are the whole
instruction set. Commitments are 32 client-supplied bytes. The program does
not open them. Nullifiers are stored so the same 32 bytes cannot be reused.
They are not checked against a spending key.

**Program ID:** `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm`

```toml
[programs.localnet]
dark_protocol_program = "E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"
```

---

## Clawd

`ClawdTeeAgent` in `@openclawdsol/dark-tee-agents` is the in-repo agent:
sealed conversation types, a policy check before a swap, and a SAS-shaped
receipt struct. Anchoring that receipt is a separate call to
`DarkAttestationService`.

```typescript
import { ClawdTeeAgent, verifyClawdQuote } from "@openclawdsol/dark-tee-agents";

const clawd = ClawdTeeAgent.spawn({
  agentId: "clawd-alpha",
  owner: ownerAddress,
  model: "dstack/claude-opus-tee",
  network: "solana-devnet",
});

// Default provider is local-dev: the quote is signed by a key this process just generated.
verifyClawdQuote(clawd, { allowedProviders: ["local-dev"] });
```

Offline walkthrough from the repo root:

```bash
npm run clawd:demo
```

Hardware attestation is a different path. Pass a quote from SGX, SEV-SNP, or
dstack through `importHardwareQuote`, and check it against that vendor's
attestation service before treating the measurement as hardware evidence.
CLAWD-TEE's gateway does the same kind of split: a stub TDX quote is not
submitted to Intel Trust Authority and is not labeled verified.

SAS program used by the agent package:
`22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`.

---

## Security

<div align="center">

```
┌─────────────────────────────────────────────────────┐
│  In the TypeScript SDK                              │
│  Note payloads can be encrypted with ChaCha20-Poly1305
│  Spend keys and viewing keys are separate structs   │
│  Diversified addresses are derived client-side      │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Not true of v1                                    │
│  Jubjub is a hash approximation                     │
│  ZK proofs are placeholders                         │
│  On-chain amount and depositor are public           │
│  Withdraw does not check a spending key             │
│  No audit                                           │
└─────────────────────────────────────────────────────┘
```

</div>

Do not use this on mainnet with real funds.

Report vulnerabilities through GitHub private advisory on this repository.
Do not open a public issue for a live exploit. See [SECURITY.md](SECURITY.md).

---

## Workspace

```bash
npm run build
npm run tee:demo
npm run clawd:demo
npm run terminal
```

```
packages/sdk            @openclawdsol/dark-protocol-sdk
packages/tee-agents     @openclawdsol/dark-tee-agents
packages/protocol       @openclawdsol/dark-protocol
packages/dark-defi      dark-defi
packages/sas-lib        local SAS client
packages/terminal       dark-x402-terminal
dark-protocol-program   Anchor note pool
programs/               other Anchor programs (stake, minter, oracle, SAS vendor tree)
```

---

<div align="center">

Solana settles. TEEs compute. Digests only.

Don't trust the machine. Verify the proof.

[Note pool source](dark-protocol-program/) · [SDK on npm](https://www.npmjs.com/package/@openclawdsol/dark-protocol-sdk) · [TEE agents on npm](https://www.npmjs.com/package/@openclawdsol/dark-tee-agents) · [CLAWD-TEE](https://github.com/Solizardking/clawd-tee)

</div>
