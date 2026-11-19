# ROTATION-RUNBOOK — retiring the committed Dark Percolator keys

**For:** the dev, on the Mac build tree (the tree the devnet program was
deployed from — see audit finding #0). **Scope:** the 9 keypairs in
INVENTORY.md §1 and the adjacent wallet in §2.

## The one fact that decides everything

**Deleting the files does not un-leak the keys.** Every keypair in
INVENTORY.md was committed to disk in the clear, copied into a flattened
bundle, and (for the publisher key) compiled into a shipped program
binary. Anyone who ever had any copy has the keys forever. The only real
fix is **rotation**: generate fresh keys, rebuild/redeploy so the fresh
public keys are the trusted ones, and treat the old keys as burned.

Git history rewriting (BFG / `git filter-repo` + force-push + asking
GitHub to purge cached views) is **out of scope** unless separately
ordered — and even if ordered, it does not recall clones, bundles, or
this VM's copies. It is hygiene, not remediation. Rotation is
remediation.

## Step 0 — Ground rules

- Do all of this on the Mac tree, where the real sources and the deployed
  program's build live. Nothing in `~/workspace/dark-defi-rewrite/` is a
  deploy source; it holds the inventory, this runbook, the guard script,
  and the patched candidate for reference.
- Never fund any old address. Never reuse an old seed for a new key.
- New secret keys live in a password manager / hardware wallet / secure
  vault — **never** in a repo tree, not even "temporarily".

## Step 1 — Generate the fresh key set

On the Mac, into a directory **outside** every repo (e.g. an encrypted
vault folder):

```bash
for name in publisher admin guardian settlement strategy payer \
            mm-oracle prop-vault private-ledger; do
  solana-keygen new --no-bip39-passphrase \
    --outfile ~/vault/dark-percolator-keys/$name.json
done
solana-keygen pubkey ~/vault/dark-percolator-keys/*.json   # record the 9 new pubkeys
```

That's 9 fresh keypairs: 1 oracle admin (publisher), 3 program IDs,
5 role/payer keys — mirroring the leaked set one-for-one.

## Step 2 — Recompile mm-oracle with the fresh admin

The leaked publisher pubkey is a compiled-in constant, so rotation
requires a rebuild, not a config change:

1. In `programs/mm-oracle/vendor/doppler/src/admin.rs`, replace the
   `ADMIN: [u8; 32]` byte array with the **fresh publisher public key**
   bytes (the file's own comment documents the verification method:
   pubkey = last 32 bytes of the keypair JSON, base58-checked).
2. Update the "VENDOR PATCH — TEST-ONLY ADMIN KEY" comment block and
   `../PROVENANCE.md` to name the new key's provenance (fresh, generated
   for this rotation, stored in the vault — not a file path inside the
   repo).
3. Rebuild via `scripts/build-programs.sh`.

## Step 3 — Fresh program IDs + rebuild

1. Point each program at its fresh keypair (`anchor keys sync`, or set
   the deploy keypair paths to the vault files from step 1) so
   `declare_id!` / the deployment config carry the new IDs:
   mm-oracle, prop-vault, private-ledger.
2. Update `runbooks/deployment.tx`: the three fixed program IDs and the
   payer path (step 5) must reference the fresh set.
3. Full rebuild; confirm the new IDs are what the binaries report.

## Step 4 — Redeploy posture

- Fresh program IDs mean **fresh deployments** — these programs have no
  state-migration path from the old IDs, and none is needed for
  devnet/test deployments. Deploy the rebuilt set as new programs.
- Set the **upgrade authority at deploy time** to something that is not
  a hot file keypair — a multisig (e.g. Squads) or a hardware-wallet
  address:
  `solana program deploy <program.so> --program-id <keypair> --upgrade-authority <multisig-or-hardware-address>`
- Once a program is stable and no longer needs upgrades, consider
  `--final` (immutable). Audit L-7: the workspace currently has **no**
  upgrade-authority handling at all — this step is where that gets fixed,
  procedurally and permanently.
- If any *old* key currently sits as upgrade authority over a live
  deployment you care about: use the old key (it still works — that's
  the problem) to transfer authority to the fresh/multisig address
  **before** retiring it, or accept that deployment as permanently
  exposed and redeploy.

## Step 5 — Re-point the roles

At deployment/init time, configure the fresh pubkeys everywhere the old
ones were trusted:

- prop-vault config: **admin**, **guardian**, **settlement** signer,
  **strategy** signer → fresh pubkeys from step 1.
- private-ledger: settlement authority → fresh settlement pubkey.
- oracle-publisher service: point its config at the fresh publisher
  keypair **path in the vault** (step 1), never a path inside the repo.
- Deployment payer: fresh payer keypair, funded as needed; update
  `runbooks/deployment.tx` accordingly.

## Step 6 — The adjacent wallet (audit I-4)

`~/workspace/clawd-dark-wallet/keypair.json` (pubkey
`DduF5aZzwTTmpfwbZFGVNFijdRwW1BuLqNKX58cAaaqx`) is a live-format secret
sitting outside any vault on this VM. It is devnet-first today. Before
that wallet ever controls mainnet value: either move the keypair into
the vault/secure store with the workspace copy securely deleted, or
rotate to a freshly derived agent wallet and retire this one. Do not
leave it as a loose file either way.

## Step 7 — Clean the trees (after rotation is live)

Only once the fresh keys are the trusted ones:

1. Delete the secret files from every working tree: `fixtures/keys/*.json`
   (keep `fixtures/keys/README.md`, rewritten to say keys are generated
   into the vault and never committed), the bundle-root copies
   (`bundle/{admin,guardian,mm-oracle,payer,private-ledger,prop-vault,publisher,settlement,strategy}.json`),
   and any other clones you know of.
2. Where test reproducibility genuinely needs keys, generate them at test
   setup time from a throwaway seed kept out of the repo — the
   `default-localnet.json` public-derivation pattern is acceptable for
   localnet precisely because those keys are public by construction and
   must never be trusted by anything real.
3. Add `hardening/gitignore-block.txt`'s rules to each repo's
   `.gitignore`.
4. Wire the guard in as a gate:
   `python3 hardening/secret-scan.py <tree>` — pre-commit hook and/or CI
   step. Acceptance test, already demonstrated: it **exits 1 on the old
   bundle** (9 hits) and **exits 0 on a clean tree**.

## Step 8 — Close-out checks

- [ ] Fresh pubkeys recorded; old pubkeys listed as burned in the vault.
- [ ] mm-oracle binary rebuilt with the fresh `ADMIN`; verify by reading
      the compiled constant's pubkey, not by trusting the build log.
- [ ] All three programs redeployed under fresh IDs; upgrade authority
      is the multisig/hardware address on each (check with
      `solana program show <id>`).
- [ ] Role configs (admin/guardian/settlement/strategy/payer) show the
      fresh pubkeys.
- [ ] oracle-publisher runs against the vault keypair path.
- [ ] Working trees deleted of key files; `.gitignore` block in place;
      `secret-scan.py` exits 0 on every tree.
- [ ] Old addresses unfunded and untrusted everywhere.

## What this runbook deliberately does not do

- No git history rewriting (see the top note — separate order required,
  and it is not a substitute for any step above).
- No changes to the original bundle or workspace trees from this pass:
  they are another workstream's reference copies. The deletions in step 7
  are the dev's to run, on his trees, after rotation.
