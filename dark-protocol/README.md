# Dark Protocol

**Privacy-First Solana Wallet with AI Agents, Jupiter Swaps, and Helius Integration**

Dark Protocol is a comprehensive privacy framework for Solana that brings Zcash-style privacy to the Solana ecosystem, enabling truly private transactions, swaps, and AI-powered DeFi operations.

## Release Status

> **2026-11-17 — core transplant (TRANSPLANT-SPEC W0–W4, W6–W8).** The
> program in `programs/dark-protocol/` is now the Dark DeFi rewrite core:
> a Groth16/BN254/Poseidon shielded **SOL** pool with real on-chain proof
> verification (program 18/18, ZK e2e 13/13, client 34/34 at transplant
> time). The previous program — an honestly gated shell over fake
> constructions — is frozen in `archive/legacy-program/`; the ungated
> `shielded-wallet` program was dropped in full and quarantined outside
> the workspace (see the repo-root `archive/shielded-wallet/DO-NOT-DEPLOY.md`).
> The AI-agent and private-swap/Jupiter instruction surface was **dropped,
> not stubbed**; v1 is SOL-only (SPL is a W8 design follow-on).

Treat only these paths as the current supported public release surface:

- `sdk/typescript/`
- `rail-worker/`

Do not ship these paths as supported public surfaces yet:

- `programs/dark-protocol/`
- `client/`
- `client-lib/`
- `zk/`
- `indexer/`
- `evm-verifier/`

Why the program and its proving stack are excluded today:

- the program was **deployed to devnet only** in the W5 rehearsal
  (2026-11-17; program ID `2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL`,
  deployed bytes hash-identical to the in-tree artifact — see
  `docs/W5-REHEARSAL.md`). The rehearsal found that `initialize`
  exceeded the 1.4M CU per-transaction cap (W5-NEW-1 below). Two
  fixes were applied the same day and the program **upgraded in
  place** on devnet both times: the zero-chain constants
  (`initialize` now lands at **25,111 CU**), then the Poseidon-cost
  fix — `poseidon2` now evaluates through the runtime's native
  `sol_poseidon` syscall instead of software light-poseidon, which
  measured at >1.4M CU *per hash* (`docs/POSEIDON-COST.md`). The
  resumed rehearsal then **completed in full**: deposits land at
  ~34.7K CU, withdraws at ~125–131K CU, and the replay, tamper,
  and drain attempts were all rejected on-chain with the designed
  errors; the SDK and indexer gates pass. The pool on devnet holds
  rehearsal notes (6 leaves; 7,000,001 deposited / 6,500,000
  withdrawn in lamports). The program remains undeployed to
  mainnet and gated as before
- its verifying key comes from a local single-contributor dev ceremony;
  a production MPC ceremony + VK rotation (W8) is required before any
  mainnet conversation
- the merged tree was re-audited on 2026-11-17 (`docs/MERGED-REAUDIT.md`:
  no new Critical/High/Medium; W5-ready from a code standpoint) — the
  open items below still stand. W5 was run on the dev's go the same
  day: deploy succeeded and is byte-verified; the rehearsal stopped
  at `initialize` on the compute-unit defect recorded as W5-NEW-1
  below, both fixes were applied and upgraded in place, and the
  resumed rehearsal **completed** — deposits, withdraws, the
  negative tests, and both gates (see `docs/W5-REHEARSAL.md`)

### Open items

Carried from the original audit, the donor re-audit, and the merged-tree
re-audit. Listing an item here does not fix it; nothing below is hidden
elsewhere in the tree either — the detail lives in the cited documents.

- **W5-NEW-1 (Critical) — Poseidon compute cost: FULLY CLOSED
  2026-11-17 (initialize AND deposit), verified on devnet.**
  Found by the W5 devnet rehearsal (`docs/W5-REHEARSAL.md`):
  `initialize` consumed the full budget and aborted
  (`ProgramFailedToComplete`) at every CU limit up to the 1.4M
  protocol max — 60 on-chain Poseidon hashes (`Frontier::new` →
  `zero_chain(20)`; `Frontier::root` → `zero_chain(20)` again + a
  20-level fold). **Fix 1 (zero-chain constants, 2026-11-17):**
  the 21 zero-chain values are constants (`src/zero_chain.rs`,
  mechanically generated from the program's own `poseidon2`, pinned
  bit-for-bit by `zero_chain_table_matches_computed_chain`), and
  the fold short-circuits on the exact constant pair
  (`merkle::combine`) — hash counts: initialize 60 → 0, deposit
  41 → 21, withdraw 1 → 1; `initialize` landed at **25,111 CU**.
  Deposit still aborted: its 21 remaining hashes exceeded the cap.
  **Fix 2 (Poseidon-cost track, 2026-11-17, dev-authorized):**
  the lab decomposition (devnet-measured) priced the old
  evaluation path at **> 1.4M CU per single hash** — parameter
  construction alone 625,961 CU, one permutation > 773,889 CU —
  so deposit died on its first hash. `poseidon2` now delegates to
  the runtime's native `sol_poseidon` syscall
  (`solana-poseidon` crate, Bn254X5 big-endian, ~819 CU/hash);
  no hash value changes — bit-identity proven on devnet *before*
  the upgrade (KAT, the full zero chain, modulus−1 boundary
  pairs, 206-case randomized differential: 206/206), and the
  gates passed with tests unmodified (host 20/20, client-lib
  34/34, ZK 13/13). Upgraded in place (tx `2Y221pP1…`, artifact
  sha256 `97187978…`, dump-verified, authority unchanged). The
  resumed rehearsal **completed**: deposits at **~34.7K CU**,
  withdraws at **~125–131K CU**, replay rejected (marker
  already-in-use), tamper rejected (`ProofVerificationFailed`),
  the NEW-1 drain attempt rejected (`UnknownRoot`), relayer
  withdraw landed, SDK and indexer gates pass. Full record:
  `docs/POSEIDON-COST.md` and `docs/W5-REHEARSAL.md`. A separate
  rent-floor finding from the same rehearsal (vault/recipient
  rent-exemption can block a withdraw at submission) is recorded
  in `docs/POSEIDON-COST.md` §8 — it is a pool-economics item,
  not part of this defect, and no program change was made for it.
- **H-1 — key rotation outstanding (dev action, Mac-side).** The 10
  keypairs leaked in the original bundle remain live until the dev
  rotates them from his Mac; deleting files cannot un-leak them.
  Runbook: `hardening/ROTATION-RUNBOOK.md`; inventory:
  `hardening/INVENTORY.md`. The codebase side is complete — this tree
  scans clean.
- **REAUDIT NEW-4 (Low) — multisig digest separator collision.**
  `proposalDigest` joins variable-length fields with bare 0x00
  separators and no length prefixes, so distinct (proposalId, action)
  pairs can collide to one digest. Confirmed unchanged in this tree.
- **REAUDIT NEW-5 (Low) — client `Note` value range.** `Note` accepts
  values up to 2¹²⁸ while the circuit and program cap at u64; a wallet
  bug could permanently strand a deposit (self-harm class). Confirmed
  unchanged in this tree.
- **REAUDIT NEW-6 (Info) — `_accountNode` exposure.**
  `deriveAccountKeys` returns `_accountNode` (the raw account root
  secret) in its result object; a stray serialization would leak it.
  Confirmed unchanged in this tree.
- **REAUDIT NEW-2 (Low) — `createSpendProof` targets the future
  transfer circuit.** Against the landed withdraw artifacts it fails
  closed; the proven v1 path is the withdraw-shaped flow. Unchanged;
  closure is designed in `docs/w8/transfer-circuit.md`, not implemented.
- **MERGED-NEW-2 (Info) — `zk/keys/ceremony_redo.sh` is a historical
  record, not a runnable procedure.** It carries donor-tree absolute
  paths because it records the NEW-1 ceremony redo as it was run.
  **P0 update (2026-11-18): CLOSED.** The runnable ceremony kit has been
  transplanted into this tree at `zk/ceremony/` (RUNBOOK.md,
  contribute.sh, verify-transcript.sh, finalize.sh, export_vk.js),
  adapted to the merged layout (`programs/dark-protocol/src/vk.rs`,
  Hermez-15 ptau defaults, acceptance gate at the merged counts —
  program 20/20, client-lib 34/34, ZK 13/13), and **re-rehearsed
  end-to-end in this tree** on the local dev ptau (fake contributions:
  transcript OK pre- and post-beacon, VK DIFFERS as required, proof
  verifies under rehearsal keys and is rejected under tree keys, 11/11
  protected tree files byte-identical before/after — full record in
  `zk/ceremony/RUNBOOK.md`). Day-0/Day-1 materials are drafted in the
  same directory (TRANSCRIPT.template.md, CONTRIBUTOR-PACKET.md,
  ANNOUNCEMENT.draft.md — drafts only, nothing published).
- **Ceremony decision + P0 prep (2026-11-18).** The verifying key still
  comes from a local single-contributor **dev ceremony** — a real MPC
  ceremony remains the mainnet gate (W8-C). The production ceremony
  package was **approved by the dev 2026-11-18**
  (`docs/CEREMONY-DECISION-BRIEF.md`): phase 1 = **Hermez perpetual
  Powers of Tau at 2^15** (`powersOfTau28_hez_final_15.ptau`, PPOT
  contributions 1–54 + beacon; BLAKE2b-512 pinned
  `982372c8…ae6e`), **drand** beacon, **5 phase-2 contributors**
  (coordinator non-contributing; **C1 filled by "8bit"**, the dev, on
  his own machine — contributor labels are public handles, no legal
  names). **ptau import: LANDED + hash-verified 2026-11-18** —
  downloaded from the circom.info mirror (the Hermez S3 mirror returns
  403 from this VM, as before), BLAKE2b-512 matched the pinned hash
  exactly, placed at `zk/keys/pot_hermez15.ptau` (37,831,832 B, sha256
  `3ef2ecc5b75d687048cf2d59195119b42fb07c5af639c5f283d84bfa69829e7f`;
  the dev ptau `pot_final.ptau` is untouched). `snarkjs powersoftau
  verify` on the imported file was attempted from this VM at P0 and
  was **killed (SIGTERM) after ~50 minutes of CPU with no output and
  no verdict** — a VM/time limit, not a verification failure; the
  file's identity already rests on the exact BLAKE2b match. The
  verify must still be run to completion (a normal machine — e.g. the
  Mac-side import procedure in the runbook — or a longer VM window)
  and its "Powers Of Tau file OK!" result is a hard Day-0 gate —
  runbook step 0 and the transcript template both require it on record
  before the first contribution. P0 kit port + re-rehearsal: see
  MERGED-NEW-2 above. Recruitment of C2/C3 is the dev's input; nothing
  has been published and nobody has been contacted.
- **Standing caveats.** (Ceremony status: see the item above.)
  `transfer` is a **fail-closed stub** (`TransferNotEnabled`). The SBF
  build is verified: deterministic artifact (323,096 B, sha256
  `c5733c01…` — the W5-NEW-1 fix build) with the withdraw stack
  frames fixed; it is deployed on devnet (W5) and was upgraded in
  place with the fix, byte-verified against the in-tree artifact
  (the ProgramData account carries 8,736 bytes of zero extension
  slack; the dump matches the artifact on all 323,096 artifact bytes
  — see `docs/W5-REHEARSAL.md`). This tree was **re-audited
  2026-11-17** (`docs/MERGED-REAUDIT.md`: no new Critical/High/Medium).
  MERGED-NEW-1 (client-lib's default ZK artifact path pointed at the
  donor tree) was closed in W5 prep — the default now resolves to this
  tree's own `zk/`.

## Features

### 🔒 Complete Privacy
- **Shielded Transactions**: Hide sender, receiver, and amount
- **Zero-Knowledge Proofs**: Verify transactions without revealing data
- **Merkle Tree Commitments**: Zcash-style privacy architecture
- **Encrypted Memos**: Private communication on-chain

### 🤖 AI Agents in TEE
- **Trusted Execution Environment**: Secure AI agent execution
- **Intel SGX/AMD SEV Support**: Hardware-level security
- **Automated Trading**: AI-powered swap recommendations
- **Portfolio Analysis**: Private portfolio optimization

### 🔄 Privacy-Preserving Swaps (Jupiter V6)
- **Jupiter Integration**: Best routes across all Solana DEXs
- **Private Swaps**: Hide transaction amounts with ZK proofs
- **Groth16 ZK-SNARKs**: 256-byte proofs for maximum privacy
- **Optimal Rates**: Real-time price discovery via Jupiter API
- **Low Slippage**: Smart routing with slippage protection
- **Perpetuals Trading**: Private leveraged positions via JLP pool
- **5 Custody Tokens**: SOL, ETH, BTC, USDC, USDT

### ⚡ Helius Infrastructure
- **Smart Transactions**: Optimized compute units and priority fees
- **Fast Confirmations**: Ultra-low latency RPC
- **Reliable Broadcasting**: Multiple regions for redundancy
- **Enhanced APIs**: Rich transaction data

### Experimental EVM Intent Proof Verifier
- **Consume-once proofs**: `evm-verifier` records EIP-712 private-payment
  proof digests once to reduce replay risk.
- **Solana-bound receipts**: Proofs bind x402/AP2/M2M rail metadata to a
  verified Solana Memo signature and cluster.
- **Relay CLI**: `scripts/submit-intent-proof.mjs` converts a wallet proof
  payload into a dry-run or executable Foundry `cast send recordIntentProof`
  call.
- **Signer CLI**: `scripts/sign-intent-proof.mjs` derives the verifier digest
  and signs it with `EVM_INTENT_PRIVATE_KEY` outside the Solana paper wallet.
- **Foundry tests**: Run `forge test` from `dark-protocol/evm-verifier`.

### Rail Worker
- **Executable handoff**: `rail-worker` validates exported x402/AP2/M2M rail
  authorization envelopes.
- **Replay and expiry checks**: The worker consumes replay keys once per
  process and rejects expired envelopes.
- **Backend adapter hooks**: The worker returns `mode: "intent-only"` when no
  backend URL is configured, or forwards locally verified requests to a live
  x402 facilitator, AP2 mandate runner, or M2M settlement backend.
- **Durable rail ledger**: Set `RAIL_WORKER_STORE_PATH` to persist replay locks
  and sanitized settlement status across restarts.
- **Solana RPC anchor verification**: Set `RAIL_WORKER_VERIFY_SOLANA_ANCHOR`
  and `RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION` to force Helius/Solana RPC Memo
  checks before replay consumption or backend settlement.
- **Node tests**: Run `npm test` from `dark-protocol/rail-worker`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension Wallet                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │   Wallet   │  │  AI Agent  │  │   Privacy Manager    │  │
│  │  Manager   │  │  Controls  │  │  (ZK Proofs, Notes)  │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │     Dark Protocol SDK       │
          │  ┌──────────────────────┐  │
          │  │  Client │ Wallet     │  │
          │  │  Swap   │ AI Agent   │  │
          │  │  Privacy│ Utils      │  │
          │  └──────────────────────┘  │
          └─────────────┬──────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                 │
   ┌────▼─────┐                    ┌─────▼──────┐
   │  Helius  │                    │  Jupiter   │
   │   SDK    │                    │    API     │
   └────┬─────┘                    └─────┬──────┘
        │                                 │
        └─────────────┬───────────────────┘
                      │
            ┌─────────▼──────────┐
            │  Solana Blockchain  │
            │  ┌──────────────┐  │
            │  │Dark Protocol │  │
            │  │   Program    │  │
            │  └──────────────┘  │
            └────────────────────┘
```

## Quick Start

### Installation

```bash
# Supported public-release surfaces
cd sdk/typescript
pnpm install
pnpm build

cd ../../rail-worker
npm install
npm test
```

If you are exploring the experimental Anchor program workspace, build it
separately with `anchor build`. Do not treat that build as a supported public
release artifact yet.

### Environment Setup

Create a local `.env` file and keep it untracked. Never commit real API keys,
RPC tokens, or private keys.

```bash
HELIUS_API_KEY=your_helius_api_key
JUPITER_API_KEY=your_jupiter_api_key  # Optional
REDPILL_API_KEY=your_redpill_api_key  # Optional, for AI agents
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_api_key
RAIL_WORKER_BACKEND_TOKEN=optional_shared_secret
RAIL_WORKER_STORE_PATH=.zolana/rail-ledger.json
RAIL_WORKER_VERIFY_SOLANA_ANCHOR=1
RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION=1
X402_FACILITATOR_URL=https://facilitator.example/authorize
AP2_MANDATE_RUNNER_URL=https://ap2.example/mandates/run
M2M_SETTLEMENT_URL=https://m2m.example/sessions/settle
```

### Basic Usage

```typescript
import { DarkProtocolClient, DarkWallet } from '@dark-protocol/sdk';

// Initialize client
const client = await DarkProtocolClient.create({
  heliusApiKey: process.env.HELIUS_API_KEY!,
  jupiterApiKey: process.env.JUPITER_API_KEY,
  redpillApiKey: process.env.REDPILL_API_KEY,
});

// Create or restore wallet
const generated = await DarkWallet.generate(client);
const wallet = generated.wallet;
// Back up generated.mnemonic offline before continuing. Do not log it.

// Initialize shielded address
const viewingKey = PrivacyUtils.generateViewingKey();
const spendingKey = crypto.getRandomValues(new Uint8Array(32));
const spendingKeyCommitment = await PrivacyUtils.hash(spendingKey);

await wallet.initializeShieldedAddress(viewingKey, spendingKeyCommitment);

// Shield tokens (move to private balance)
const amount = BigInt(1_000_000_000); // 1 SOL
const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
await wallet.shieldTokens(amount, tokenMint);

// Private transfer
await wallet.privateTransfer(
  recipientAddress,
  BigInt(500_000_000), // 0.5 SOL
  'Hello from Dark Protocol!'
);
```

### Private Swaps

```typescript
import { PrivateSwapManager } from '@dark-protocol/sdk';

const swapManager = new PrivateSwapManager(client, process.env.JUPITER_API_KEY);

// Execute private swap
const signature = await swapManager.executePrivateSwap({
  inputMint: USDC_MINT,
  outputMint: SOL_MINT,
  inputAmount: BigInt(100_000_000), // 100 USDC
  minOutputAmount: BigInt(1_000_000_000), // 1 SOL minimum
  slippageBps: 50, // 0.5% slippage
  userPublicKey: wallet.publicKey,
});
```

### AI Agents

```typescript
import { AIAgentManager } from '@dark-protocol/sdk';

const aiManager = new AIAgentManager(client, process.env.REDPILL_API_KEY);

// Register AI agent
const agent = await aiManager.registerAgent({
  agentPubkey: agentKeypair.publicKey,
  teeAttestation: {
    measurement: attestationMeasurement,
    timestamp: Date.now(),
    signature: attestationSignature,
  },
  capabilities: [
    { type: 'swap', enabled: true, maxAmount: BigInt(10_000_000_000), requiresApproval: false },
    { type: 'analyze', enabled: true, requiresApproval: false },
  ],
  owner: wallet.publicKey,
});

// Get AI recommendations
const recommendations = await aiManager.getSwapRecommendations({
  agentPubkey: agentKeypair.publicKey,
  portfolioData: await wallet.getState(),
});
```

## Privacy Model

### Shielded Pool

Dark Protocol uses a shielded pool similar to Zcash's Sapling protocol:

1. **Shield**: Move tokens from transparent to shielded pool
2. **Private Transfer**: Transfer within shielded pool
3. **Unshield**: Move tokens from shielded to transparent pool

### Zero-Knowledge Proofs

Transactions are verified using ZK-SNARKs without revealing:
- Sender address
- Receiver address
- Transaction amount
- Token type (optional)

### Commitment Scheme

```
Commitment = Hash(Value || Randomness)
Nullifier = Hash(Commitment || Secret)
```

## Integration Guide

### Browser Extension

The browser extension provides a user-friendly interface:

```bash
cd browser-extension-master
npm install
npm run build
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build` directory

### Helius Integration

Dark Protocol uses Helius for:
- **Smart Transactions**: Automatic compute unit optimization
- **Priority Fees**: Dynamic fee calculation
- **Transaction Broadcasting**: Multi-region redundancy
- **Enhanced RPC**: Rich transaction APIs

```typescript
const tx = await client.createSmartTx({
  instructions: [instruction1, instruction2],
  signers: [wallet.keypair],
  feePayer: wallet.publicKey,
});
```

### Jupiter Integration

Dark Protocol integrates with Jupiter V6 for privacy-preserving swaps and perpetuals trading.

#### Jupiter V6 Swaps

**On-Chain Integration**: `programs/dark-protocol/src/integrations/jupiter.rs`

```rust
// Jupiter V6 Program
pub const JUPITER_PROGRAM_ID: Pubkey = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

// Execute private swap with ZK proof
pub fn execute_dark_swap(
    ctx: DarkSwapContext,
    input_commitment: [u8; 32],
    output_commitment: [u8; 32],
    nullifier: [u8; 32],
    proof: Vec<u8>,
    route: JupiterRoute,
) -> Result<u64>
```

**TypeScript SDK**: `sdk/typescript/src/jupiter-swap.ts`

```typescript
import { JupiterSwapClient } from '@dark-protocol/sdk';

const jupiterClient = new JupiterSwapClient(client, process.env.JUPITER_API_KEY);

// Get swap quote
const quote = await jupiterClient.getQuote({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '1000000000', // 1 SOL
  slippageBps: 50, // 0.5% slippage
});

// Execute private swap with ZK proof
const signature = await jupiterClient.executePrivateSwap(
  new PublicKey(TOKENS.SOL),
  new PublicKey(TOKENS.USDC),
  BigInt(1_000_000_000),
  {
    inputCommitment: commitment,
    outputCommitment: newCommitment,
    nullifier: nullifier,
    proof: {
      proofA: new Uint8Array(64),
      proofB: new Uint8Array(128),
      proofC: new Uint8Array(64),
    },
    slippageBps: 50,
    priorityFee: 1000,
  }
);

// Get token prices
const solPrice = await jupiterClient.getTokenPrice(TOKENS.SOL);

// Find best route with constraints
const route = await jupiterClient.findBestRoute(
  TOKENS.SOL,
  TOKENS.USDC,
  BigInt(5_000_000_000),
  {
    maxSlippage: 100,
    maxPriceImpact: 1.0,
    onlyDirectRoutes: false,
  }
);
```

#### Jupiter Perpetuals (JLP Pool)

**JLP Pool**: `5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq`

**Custody Accounts**:
- SOL: `7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz`
- ETH: `AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn`
- BTC: `5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm`
- USDC: `G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa`
- USDT: `4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk`

```typescript
import { JupiterPerpetualsClient } from '@dark-protocol/sdk';

const perpsClient = new JupiterPerpetualsClient(client);

// Get JLP pool state
const poolState = await perpsClient.getPoolState();

// Get custody state
const solCustody = await perpsClient.getCustodyState('SOL');

// Open private long position
const positionSignature = await perpsClient.openPosition({
  token: 'SOL',
  collateralToken: 'USDC',
  sizeUsd: BigInt(1000_000_000),    // $1000
  collateralUsd: BigInt(200_000_000), // $200
  side: 'long',
  leverage: 5,
  slippageBps: 50,
  proof: zkProof,
});

// Close position
await perpsClient.closePosition({
  positionKey: positionPubkey,
  entirePosition: true,
  slippageBps: 50,
  proof: zkProof,
});

// Get position PnL
const { unrealizedPnL, realizedPnL } = await perpsClient.getPositionPnL(positionPubkey);

// Get liquidation price
const liqPrice = await perpsClient.getLiquidationPrice(positionPubkey);
```

#### Privacy Guarantees

**What's Hidden**:
- Transaction amounts (via commitments)
- Sender identity (via ZK proofs)
- Receiver identity (via shielded addresses)

**What's Public**:
- Program interactions (Jupiter program calls visible)
- Timing metadata (transaction timestamps)
- Route plans (DEX routing visible, but not amounts)

#### ZK Proof Structure (Groth16)

```
256-byte proof:
├── Proof A: 64 bytes
├── Proof B: 128 bytes
└── Proof C: 64 bytes

Public Inputs:
├── Merkle Root (32 bytes)
├── Input Commitment (32 bytes)
├── Output Commitment (32 bytes)
└── Nullifier (32 bytes)
```

#### Integration Flow

```
1. User initiates swap
2. Generate ZK proof (off-chain)
3. Get Jupiter quote from API
4. Build transaction with commitments, nullifier, proof, route
5. Submit to Dark Protocol
6. Verify ZK proof on-chain
7. Check nullifier (prevent double-spend)
8. Execute Jupiter swap via CPI
9. Verify output amount vs slippage
10. Update merkle tree
11. Emit events
```

#### Performance

- **Private swap**: ~150,000 compute units
- **ZK proof verification**: ~80,000 compute units
- **Merkle tree update**: ~30,000 compute units
- **Jupiter route execution**: ~40,000 compute units
- **Target throughput**: 1,000+ swaps/second
- **Latency**: <500ms end-to-end

See [JUPITER_INTEGRATION.md](./JUPITER_INTEGRATION.md) for complete integration details.

## Security

### Audits
- [ ] Trail of Bits (Pending)
- [ ] Zellic (Pending)
- [ ] OtterSec (Pending)

### Best Practices
1. Never share your viewing key
2. Backup your mnemonic securely
3. Verify TEE attestations
4. Use hardware wallets for large amounts
5. Review AI agent capabilities before approval

## Development

### Experimental program work

```bash
# Experimental Anchor workspace only
cd dark-protocol
anchor build

# Do not deploy as a supported public release yet
```

### Run Tests

```bash
# Rust tests
cargo test

# TypeScript tests
cd sdk/typescript
npm test
```

### Generate IDL

```bash
anchor build
```

## Roadmap

### Phase 1: Core Privacy (Q1 2025) ✅
- [x] Shielded transactions
- [x] ZK proof verification
- [x] Merkle tree implementation
- [x] Privacy pools

### Phase 2: Integration (Q2 2025)
- [x] Jupiter swap integration
- [x] Helius infrastructure
- [x] Browser extension
- [ ] Mobile wallet

### Phase 3: AI Agents (Q3 2025)
- [x] TEE environment
- [x] AI agent registration
- [ ] Advanced trading strategies
- [ ] Multi-agent coordination

### Phase 4: Ecosystem (Q4 2025)
- [ ] Private NFTs
- [ ] Private governance
- [ ] Cross-chain privacy
- [ ] Privacy-preserving oracles

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache 2.0 - see [LICENSE](./LICENSE)

## Links

- **Website**: https://dark-protocol.io
- **Docs**: https://docs.dark-protocol.io
- **Discord**: https://discord.gg/dark-protocol
- **Twitter**: https://twitter.com/DarkProtocol

## Acknowledgments

Built on the shoulders of giants:
- **Zcash**: Privacy protocol inspiration
- **Solana Foundation**: High-performance blockchain
- **Jupiter**: DEX aggregation
- **Helius**: Infrastructure and APIs
- **Anchor**: Development framework

---

**Privacy is a right, not a privilege. Build with Dark Protocol.**
