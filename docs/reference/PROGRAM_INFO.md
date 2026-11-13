# 🔑 Dark Protocol - Program Information

> ⚠️ **SECURITY NOTICE — leaked keypairs purged**
>
> Earlier revisions of this file pasted seed phrases and raw secret-key byte
> arrays for the two program-ID keypairs below. Those values were committed
> to a public GitHub repo and **must be considered permanently compromised.**
> They have been redacted from this file. The on-chain *upgrade authority*
> (`5m8qxm4j75VQCv34oUThE5QNbKJG7KHfd85NdK4dVagS`) was **not** in the leak —
> but the keypair for that authority is **currently unaccounted-for**, so the
> deployed devnet programs are effectively immutable until that key is found
> or fresh programs are deployed under new IDs.
>
> Going forward: never paste seed phrases, mnemonics, raw `solana-keygen`
> JSON byte arrays, or any private key material into a doc, comment, commit
> message, or chat. Keep keypairs in `.secrets/` (gitignored) or a hardware
> wallet / password manager. Public keys and program IDs are fine to document.

This document contains program deployment information: program IDs, on-chain
addresses, network deployment status, and configuration. **Private keys and
seed phrases are deliberately omitted.**

## 📋 Program IDs

### Current note pool

The shielded note pool and the shielded wallet are the same program.
`declare_id!` in `dark-protocol-program` is:

```
E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm
```

`Anchor.toml` lists that id under `[programs.localnet]`. A public RPC read
on 13 November 2026 found an upgradeable program account on **devnet** and
no account on mainnet. Devnet upgrade authority at that read:
`AAqkn72VgkZqFbWggn9SvzjzMRW5zsZrTe5VZKu9DwaM`.
Bytecode was not compared to this tree. Do not treat the deployment as audited
or as a mainnet program.

### Historical program IDs (do not use for new work)

```
Dark Protocol Program ID: 3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC
Shielded Wallet Program ID: 4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg
```

These remain executable on devnet. Their program-ID keypairs were published
in earlier revisions of this file. On 13 November 2026 the devnet upgrade
authority for both was `5m8qxm4j75VQCv34oUThE5QNbKJG7KHfd85NdK4dVagS`.
`3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC` is not a program on mainnet.

### Network Deployment Status

| Program | Id | Devnet (13 Nov 2026) | Mainnet (13 Nov 2026) |
|---------|----|----------------------|------------------------|
| **note pool (current)** | `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm` | Executable program account | No account |
| **legacy dark-protocol** | `3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC` | Executable, keypair published | System-owned account, not a program |
| **legacy shielded-wallet** | `4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg` | Executable, keypair published | No account |

### Deployment Signatures (Devnet)

**Dark Protocol:**
```
Signature: 2AJGoZMqeyUn7MA7BiUHs1Vke5WUjz7VE7eiGBxb3sxVfd7M1JekM5z81B4xczrefeMc2m4p18YjissTi468Z53x
```

**Shielded Wallet:**
```
Signature: 3iLxV1XYQyajNSFZ7sqZkC1SZ91hvdtxVN2v48S4FkstUKDcDcQGKu7A2PJXV2ccthT3moR4KGBQRsjpMSfXMxwQ
```

## 🔐 Keypair Information

> Private keys, mnemonics, and raw `solana-keygen` JSON for these keypairs
> were previously committed to this repo and are now considered burned.
> They are **not** documented here. Store keypairs in `.secrets/` (gitignored),
> a hardware wallet, or a password manager — never in a doc.

### Legacy Dark Protocol Keypair

- **Program ID (public, on-chain):** `3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC`
- **Local keypair file (do NOT commit):** `target/deploy/dark_protocol-keypair.json`
- **Status:** compromised by the prior leak. Do not deploy new code under this id.

### Legacy Shielded Wallet Keypair

- **Program ID (public, on-chain):** `4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg`
- **Local keypair file (do NOT commit):** `target/deploy/shielded_wallet-keypair.json`
- **Status:** compromised by the prior leak. Same caveat as above.

### Legacy upgrade authority

- **Address:** `5m8qxm4j75VQCv34oUThE5QNbKJG7KHfd85NdK4dVagS`
- **Status:** this file records the keypair as lost / unaccounted-for. A devnet read on 13 November 2026 still shows this address as the upgrade authority of the two legacy programs above. The current note pool `E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm` has a different devnet upgrade authority: `AAqkn72VgkZqFbWggn9SvzjzMRW5zsZrTe5VZKu9DwaM`.

## 📦 Compiled Binaries

### Binary Information

| Program | File | Size | Location |
|---------|------|------|----------|
| **dark-protocol** | `dark_protocol.so` | 334 KB | `target/deploy/dark_protocol.so` |
| **shielded-wallet** | `shielded_wallet.so` | 421 KB | `target/deploy/shielded_wallet.so` |

### Build Configuration

- **Anchor Version:** 0.32.1 (CLI), 0.30.0 (Framework)
- **Solana Version:** 1.18.0
- **Rust Toolchain:** Stable
- **BPF Target:** `bpfel-unknown-unknown`

## 🔧 Configuration Files

### Anchor.toml Configuration

The current note pool manifest is `dark-protocol-program/Anchor.toml`.
It declares one id, and only for localnet:

```toml
[programs.localnet]
dark_protocol_program = "E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"
```

### Program lib.rs Declaration

**dark-protocol-program/programs/dark-protocol-program/src/lib.rs:**

```rust
declare_id!("E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm");
```

The two `declare_id!` values below belong to the legacy programs whose
keypairs were published. They are not the current note pool.

```rust
declare_id!("3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC");
declare_id!("4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg");
```

## 🌐 RPC Endpoints

### Helius RPC Configuration

**Devnet (Public):**
```
https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

**Devnet (Secure):**
```
https://your-devnet-staked-endpoint.helius-rpc.com
```

**Mainnet (Public):**
```
https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

**Mainnet (Secure):**
```
https://your-mainnet-staked-endpoint.helius-rpc.com
```

**Localnet:**
```
http://localhost:8899
```

## ⚠️ Security Warnings

### Critical Information

🔴 **NEVER SHARE THESE FILES PUBLICLY:**
- `target/deploy/dark_protocol-keypair.json`
- `target/deploy/shielded_wallet-keypair.json`
- Seed phrases listed above

🔴 **THESE KEYPAIRS CONTROL THE PROGRAMS:**
- Anyone with access to these keypairs can upgrade the programs
- Store them securely in a password manager or hardware wallet
- Consider using a multisig for mainnet deployments

### Backup Recommendations

1. **Encrypted Backup:** Store keypairs in an encrypted backup
2. **Multiple Locations:** Keep copies in separate secure locations
3. **Access Control:** Limit who has access to these files
4. **Monitoring:** Set up alerts for program upgrades

## 📊 Deployment History

### Build & Deployment History

| Date | Time | Action | Result |
|------|------|--------|--------|
| 2025-11-11 | 14:00 | Generated new keypairs | Success |
| 2025-11-11 | 14:00 | Fixed workspace dependencies | Success |
| 2025-11-11 | 14:00 | Fixed Anchor fallback function error | Success |
| 2025-11-11 | 14:00 | Fixed borrow/move errors | Success |
| 2025-11-11 | 14:00 | Built dark-protocol (334 KB) | Success |
| 2025-11-11 | 14:00 | Built shielded-wallet (421 KB) | Success |
| 2025-11-11 | 15:09 | **Deployed dark-protocol to Devnet** | ✅ **SUCCESS** |
| 2025-11-11 | 15:09 | **Deployed shielded-wallet to Devnet** | ✅ **SUCCESS** |

### Known Issues Resolved

1. ✅ Invalid Base58 program IDs (original user-provided IDs)
2. ✅ Workspace dependency conflicts
3. ✅ Anchor fallback function detection errors
4. ✅ Rust borrow checker errors in private_transfer
5. ✅ Program ID conflict on devnet (old shielded_wallet ID)
6. ✅ Missing idl-build features

### Remaining Warnings

- **BPF Stack Warnings:** Expected in Sapling crypto functions (non-blocking)
- These are documented limitations of BPF stack constraints
- Do not affect program functionality

## 🚀 Next Steps

### ✅ Devnet Deployment - COMPLETE!

1. ✅ Programs compiled successfully
2. ✅ Funded deployment wallet with SOL
3. ✅ Deployed to devnet successfully
4. ⏳ Verify on Solana Explorer (see links below)
5. ⏳ Test program instructions
6. ⏳ Update SDK with deployed program IDs

### Verification Links

**Dark Protocol Explorer:**
```
https://explorer.solana.com/address/3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC?cluster=devnet
https://explorer.solana.com/tx/2AJGoZMqeyUn7MA7BiUHs1Vke5WUjz7VE7eiGBxb3sxVfd7M1JekM5z81B4xczrefeMc2m4p18YjissTi468Z53x?cluster=devnet
```

**Shielded Wallet Explorer:**
```
https://explorer.solana.com/address/4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg?cluster=devnet
https://explorer.solana.com/tx/3iLxV1XYQyajNSFZ7sqZkC1SZ91hvdtxVN2v48S4FkstUKDcDcQGKu7A2PJXV2ccthT3moR4KGBQRsjpMSfXMxwQ?cluster=devnet
```

### For Mainnet (Future)

⚠️ **DO NOT deploy to mainnet yet. Required first:**
- Security audit by reputable firm
- ZK-SNARK circuit production implementation
- Threshold ElGamal SDK implementation
- Resolution of BPF stack warnings
- Comprehensive testing on devnet
- Community review

## 📝 Notes

- Programs use Anchor framework 0.30.0 (code) with CLI 0.32.1
- Both programs successfully compiled with latest fixes
- Keypairs generated with valid Base58 encoding
- All configuration files updated with correct IDs
- Ready for devnet deployment pending wallet funding

---

**Last Updated:** November 11, 2025 - 3:09 PM EST
**Status:** 🎉 **DEPLOYED TO DEVNET - LIVE!**
