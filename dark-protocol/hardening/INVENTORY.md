# INVENTORY — committed secret key material (audit H-1, I-4)

**Date:** 2026-11-16 · **Method:** `hardening/secret-scan.py` (parses keypair
files, derives the public key from the stored public half) + sha256
comparison for byte-identity. **No secret bytes are reproduced anywhere in
this document — files are identified by path and public key only.**
Scope: `~/workspace/dark-percolator/bundle/`,
`~/workspace/dark-defi-guide/src/Dark-Defi-1/`, the origin tree the bundle
was flattened from, and the adjacent wallet named by audit I-4.

## 1. The nine keypairs (audit H-1)

Each exists **twice**: the origin in the prop-mm workspace `fixtures/keys/`
and a **byte-identical** copy (sha256-verified) at the root of the
flattened bundle. Format: bare JSON array of 64 integers — a full Solana
secret keypair, usable as-is by anyone who can read the file.

| Role | Public key | Origin (workspace) | Bundle copy |
|---|---|---|---|
| publisher — mm-oracle feed admin | `gK6wUe7seknNttsuAUuTb4qrwntcLxwsHg12MDUrMB5` | `dark-percolator/percolator-p1/phoenix-private-prop-mm-master/fixtures/keys/publisher.json` | `dark-percolator/bundle/publisher.json` |
| admin — vault role actor | `9aoXLohzrrXyKaKDZNwDTkeqsypyygrNVv1PXAGDii2W` | `…/fixtures/keys/admin.json` | `dark-percolator/bundle/admin.json` |
| guardian — vault role actor | `GxSVicr7w7NWtm5ThdspYhgYdkfgDgjKKmucLE8eQ7cy` | `…/fixtures/keys/guardian.json` | `dark-percolator/bundle/guardian.json` |
| settlement — vault role actor | `5sbfExZbKmGDTU9abVqbCeu6iZNGSiFrA6HPeqHUgjwc` | `…/fixtures/keys/settlement.json` | `dark-percolator/bundle/settlement.json` |
| strategy — vault role actor | `hoSqjmnjbgjfLPDgUw3nqHW1WFDqj5q7YWE1xYKMfc2` | `…/fixtures/keys/strategy.json` | `dark-percolator/bundle/strategy.json` |
| payer — deployment payer | `HpT83rXz7ypFdGWMXAQUfUoHA6GdREqYKhjwNFAMvp5` | `…/fixtures/keys/payer.json` | `dark-percolator/bundle/payer.json` |
| mm-oracle — program deploy key | `6YZi3A4qs4sM7MppJmpRHUPUHcQ48SzquBZnQaecovag` | `…/fixtures/keys/mm-oracle.json` | `dark-percolator/bundle/mm-oracle.json` |
| prop-vault — program deploy key | `CBcZthchNws8GsQotgTQMCKeXeFS5fpZMKWq4GAfmDf3` | `…/fixtures/keys/prop-vault.json` | `dark-percolator/bundle/prop-vault.json` |
| private-ledger — program deploy key | `5yzn86FmDn7f3RtMrf4LxT3ok4E8GysPKS4ne9DagsgQ` | `…/fixtures/keys/private-ledger.json` | `dark-percolator/bundle/private-ledger.json` |

(`…/fixtures/keys/` = the full workspace path in the Origin column's first
row. The bundle copies were **not** modified or deleted by this pass —
the original bundle is a read-only reference for another workstream.)

### Where each public half is used

- **publisher** — its public key is **compiled into the mm-oracle
  program** as the `ADMIN` constant:
  `programs/mm-oracle/vendor/doppler/src/admin.rs` (the vendored patch
  block names `fixtures/keys/publisher.json` explicitly and embeds the 32
  public bytes). Whoever holds this keypair can sign mm-oracle price
  updates for **any** deployment of this binary. The oracle-publisher
  service (`services/oracle-publisher`) is the intended signer.
- **mm-oracle / prop-vault / private-ledger** — program deploy keys:
  their public keys are the fixed program IDs in
  `runbooks/deployment.tx` and are baked into the program binaries
  (`fixtures/keys/README.md`: "their pubkeys are baked into the program
  binaries"). A program keypair is also the **initial upgrade authority**
  of a deployment unless explicitly changed at deploy time — audit L-7
  found no upgrade-authority handling anywhere in the workspace.
- **admin / guardian / settlement / strategy** — vault role actors for
  the test deployments (prop-vault admin, pause/unwind guardian,
  settlement signer, strategy signer, per `fixtures/keys/README.md` and
  the programs' signer matrices).
- **payer** — the deployment runbook loads it directly:
  `runbooks/deployment.tx` sets `keypair_json = "../fixtures/keys/payer.json"`.

### What these keys are NOT

Per audit H-1 (verified there by derivation): these are **not** the
deterministic localnet fixtures of `bundle/default-localnet.json`, and
**none** of them matches the devnet Dark Percolator program
(`Cf8dRz9x…`) or its deployer. The exposure is therefore: any deployment
of *this* workspace's binaries (Surfpool/localnet today, anything
deployed from these trees tomorrow), plus any system that later trusts
one of these pubkeys.

Note on `bundle/default-localnet.json`: it contains **no key bytes**,
but it publishes a derivation recipe (public base seed +
`keypair_from_seed(sha256(baseSeed‖seed))`), so every key it defines is
publicly regenerable by construction — a different, self-consistent test
key set. No action needed beyond never reusing that scheme for real keys.

Note on `bundle/leak-check.sh`: the bundle's own hygiene gate sanctions
keypairs **only** inside `fixtures/keys/`. The flattened bundle's root
copies sit outside that sanctioned path, and the gate's only mitigation
for the fixtures themselves is procedural (the README's "TEST-ONLY"
label). A label is not a control: the publisher key is compiled into a
shipped binary, which makes it a production-relevant secret regardless
of intent.

## 2. Adjacent live-format secret (audit I-4)

| What | Public key | Path |
|---|---|---|
| Clawd dark-wallet agent keypair (Helius SPR/TSPP system — separate from Dark Percolator) | `DduF5aZzwTTmpfwbZFGVNFijdRwW1BuLqNKX58cAaaqx` | `~/workspace/clawd-dark-wallet/keypair.json` |

A raw 64-element secret-key JSON array on disk (mode 0600), outside any
vault. Devnet-first today; the risk scales with whatever this key comes
to control. Handled in the runbook, step 6.

## 3. Checked — no secret key material found

- **`~/workspace/dark-defi-guide/src/Dark-Defi-1/`** — full-tree scan:
  **0 hits.** No keypair JSON files, no embedded 64-byte arrays, no PEM
  private keys. (Two `.env.example` templates were scanned and are clean.)
  The Dark-Defi-1 exposure is its placeholder cryptography (audit C-2…C-7),
  not committed keys.
- The rewrite tree `~/workspace/dark-defi-rewrite/` itself scans clean —
  that is the guard script's acceptance test (see ROTATION-RUNBOOK.md).

## Totals

- **19 files** contain full secret keypairs: 9 keys × 2 locations (18
  files) in the percolator trees, + 1 adjacent wallet file.
- **10 distinct keypairs**: 9 in the H-1 set, 1 in the I-4 set.
- Every one of them must be treated as **public** from the moment it was
  committed. See ROTATION-RUNBOOK.md — deletion is not a fix; rotation is.
