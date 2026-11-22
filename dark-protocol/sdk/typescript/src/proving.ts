/**
 * Proving bridge (TRANSPLANT-SPEC §5.4 step 3 / W6).
 *
 * The SDK's note construction, key derivation, Poseidon, Merkle paths and
 * proof verification come from `@dark-protocol/client-lib` — the Dark DeFi
 * rewrite client, transplanted to `dark-protocol/client-lib/`. The hash
 * stand-ins that used to live in this SDK (sapling.ts / privacy.ts /
 * note-encryption.ts: BLAKE3/SHA-256 domain hashes presented as Sapling)
 * were deleted, not ported; nothing in this SDK computes a commitment or
 * nullifier with anything but the real contract:
 *
 *   nk = Poseidon(sk, 0) · owner_id = Poseidon(sk, 1)
 *   cm = Poseidon(owner_id, value, blinding) · nf = Poseidon(nk, leaf_index)
 *   leaf = Poseidon(cm, amount) (deposit-bound, NEW-1) · depth-20 Poseidon tree
 *
 * Known split (REAUDIT NEW-2, inherited from the donor, documented — not
 * hidden): client-lib's `createSpendProof` input builder targets the
 * future transfer circuit. The proven v1 withdraw path builds
 * withdraw-shaped inputs ([root, nf, recipient, amount]) exactly as
 * client-lib's own integration test does, and verifies with
 * `verifySpendProof` against the landed `zk/` artifacts. The SDK exposes
 * the pieces; it does not paper over the split.
 */
export {
  Note,
  deriveAccountKeys,
  masterFromSeed,
  poseidonHash,
  boundLeaf,
  computeRoot,
  getMerklePath,
  verifyMerklePath,
  leavesFromNotes,
  buildSpendInputs,
  verifySpendProof,
  ArtifactMissingError,
  defaultArtifactPaths,
} from '@dark-protocol/client-lib';
