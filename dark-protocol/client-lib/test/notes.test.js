// Commitments, nullifiers, Merkle paths — the shared Poseidon/BN254 contract.
// Pins the circomlib Poseidon test vector so a parameter drift (client vs
// circuit) fails loudly here instead of silently on-chain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  poseidonHash,
  deriveAccountKeys,
  Note,
  openCommitment,
  computeRoot,
  getMerklePath,
  verifyMerklePath,
  emptyRoot,
  TREE_DEPTH,
} from '../src/index.js';

test('circomlib Poseidon test vector is pinned (cross-check vs circuit when artifacts land)', async () => {
  // circomlibjs buildPoseidon, inputs [1, 2] over BN254 Fr.
  const h = await poseidonHash([1n, 2n]);
  assert.equal(
    h,
    7853200120776062878684798364095072458815029376092732009249414926327459813530n,
  );
});

test('commitment opens correctly and binds the value (H-7)', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(11), 0);
  const note = Note.create(keys.ownerId, 500n);
  const cm = await note.commitment();
  assert.equal(
    await openCommitment(cm, { ownerId: note.ownerId, value: 500n, blinding: note.blinding }),
    true,
  );
  // tampered value fails
  assert.equal(
    await openCommitment(cm, { ownerId: note.ownerId, value: 501n, blinding: note.blinding }),
    false,
  );
  // tampered blinding fails
  assert.equal(
    await openCommitment(cm, { ownerId: note.ownerId, value: 500n, blinding: note.blinding + 1n }),
    false,
  );
  // different owner fails
  assert.equal(
    await openCommitment(cm, { ownerId: keys.ownerId + 1n, value: 500n, blinding: note.blinding }),
    false,
  );
});

test('commitment is hiding: same value, different blinding -> different cm', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(12), 0);
  const a = new Note({ ownerId: keys.ownerId, value: 10n, blinding: 111n });
  const b = new Note({ ownerId: keys.ownerId, value: 10n, blinding: 222n });
  assert.notEqual(await a.commitment(), await b.commitment());
});

test('nullifier is deterministic per (key, leaf) and unique per leaf (C-6)', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(13), 0);
  const n1 = new Note({ ownerId: keys.ownerId, value: 1n, blinding: 5n, leafIndex: 7 });
  const n2 = new Note({ ownerId: keys.ownerId, value: 2n, blinding: 6n, leafIndex: 7 });
  const n3 = new Note({ ownerId: keys.ownerId, value: 1n, blinding: 5n, leafIndex: 8 });
  // nf depends on (nk, leaf_index) only — same leaf, same nullifier,
  // regardless of the note's value/blinding: that is what makes a second
  // spend of the same leaf detectable.
  assert.equal(await n1.nullifier(keys.nk), await n2.nullifier(keys.nk));
  assert.equal(await n1.nullifier(keys.nk), await n1.nullifier(keys.nk));
  assert.notEqual(await n1.nullifier(keys.nk), await n3.nullifier(keys.nk));
  // a different wallet's nk gives a different nullifier for the same leaf
  const other = await deriveAccountKeys(new Uint8Array(32).fill(14), 0);
  assert.notEqual(await n1.nullifier(keys.nk), await n1.nullifier(other.nk));
  // unknown leaf index is an error, never a fabricated nullifier
  const unplaced = Note.create(keys.ownerId, 1n);
  await assert.rejects(() => unplaced.nullifier(keys.nk), /leafIndex unknown/);
});

test('bound leaf binds the deposited amount (NEW-1)', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(16), 0);
  const note = new Note({ ownerId: keys.ownerId, value: 1_000_000n, blinding: 777n });
  const cm = await note.commitment();
  const { boundLeaf } = await import('../src/poseidon.js');
  // the leaf for the note's own value is Poseidon(cm, value)
  assert.equal(await note.boundLeaf(), await boundLeaf(cm, 1_000_000n));
  // the leaf a 1-lamport deposit of the same commitment would produce is a
  // DIFFERENT leaf — that difference is the whole NEW-1 fix
  assert.notEqual(await note.boundLeaf(), await boundLeaf(cm, 1n));
  // and a tree over raw commitments (the pre-fix shape) roots differently
  // from the pool's tree over bound leaves
  const poolRoot = await computeRoot([await note.boundLeaf()]);
  const rawRoot = await computeRoot([cm]);
  assert.notEqual(poolRoot, rawRoot);
});

test('Merkle path verifies against the root (M-11) at depth 20', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(15), 0);
  const notes = [Note.create(keys.ownerId, 1n), Note.create(keys.ownerId, 2n), Note.create(keys.ownerId, 3n)];
  // the pool's tree holds bound leaves, never raw commitments (NEW-1)
  const leaves = [];
  for (const n of notes) leaves.push(await n.boundLeaf());
  const root = await computeRoot(leaves);
  assert.notEqual(root, await emptyRoot());
  for (let i = 0; i < leaves.length; i++) {
    const path = await getMerklePath(leaves, i);
    assert.equal(path.pathElements.length, TREE_DEPTH);
    assert.equal(path.root, root);
    assert.equal(await verifyMerklePath(leaves[i], path), true);
    // a path for leaf i does not verify leaf j
    if (i + 1 < leaves.length) {
      assert.equal(await verifyMerklePath(leaves[i + 1], path), false);
    }
  }
});

test('empty tree root is the depth-20 zero hash', async () => {
  assert.equal(await computeRoot([]), await emptyRoot());
});
