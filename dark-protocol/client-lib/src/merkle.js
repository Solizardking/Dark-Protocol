// Commitment Merkle tree — Poseidon over BN254, depth 20 (shared contract).
//
// Fixes M-11: the old tree was a SHA-256 list with pairwise duplication and an
// unused depth field — witnesses from it could never verify against a real
// anchor. This tree's root and authentication paths are exactly what the
// withdraw circuit checks: leaves are DEPOSIT-BOUND leaves
// `Poseidon(cm, amount)` (re-audit NEW-1 — the on-chain program inserts the
// bound leaf it computes at deposit, never the raw commitment), internal
// nodes are Poseidon(left, right), empty subtrees hash up from the zero leaf.
//
// Every `leaves` array in this module is an array of bound leaves. Use
// leavesFromNotes() to build one from Note objects so the binding can
// never be forgotten by a caller.

import { poseidonHash } from './poseidon.js';

export const TREE_DEPTH = 20;
export const MAX_LEAVES = 2 ** TREE_DEPTH;

/** Zero hashes per level: zeros[0] = empty leaf, zeros[i+1] = Poseidon(zeros[i], zeros[i]). */
let _zeros = null;
export async function zeroHashes() {
  if (_zeros) return _zeros;
  const zeros = [0n];
  for (let i = 1; i <= TREE_DEPTH; i++) {
    zeros.push(await poseidonHash([zeros[i - 1], zeros[i - 1]]));
  }
  _zeros = zeros;
  return zeros;
}

export async function emptyRoot() {
  const zeros = await zeroHashes();
  return zeros[TREE_DEPTH];
}

/**
 * Map Note objects to the bound leaves the pool's tree holds, in order:
 * leaf_i = Poseidon(cm_i, value_i) — the exact values the program inserts
 * at deposit.
 */
export async function leavesFromNotes(notes) {
  const leaves = [];
  for (const n of notes) leaves.push(await n.boundLeaf());
  return leaves;
}

/**
 * Root of the tree whose first leaves.length positions are `leaves`
 * (bound leaves, BigInts) and the rest are empty.
 */
export async function computeRoot(leaves) {
  if (leaves.length > MAX_LEAVES) throw new Error('computeRoot: too many leaves');
  const zeros = await zeroHashes();
  let level = leaves.slice();
  for (let depth = 0; depth < TREE_DEPTH; depth++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : zeros[depth];
      next.push(await poseidonHash([left, right]));
    }
    if (next.length === 0) next.push(zeros[depth + 1]);
    level = next;
  }
  return level[0];
}

/**
 * Authentication path for the leaf at `index`: { pathElements: BigInt[20],
 * pathIndices: number[20] } in the exact shape the spend circuit consumes
 * (pathIndices[i] = bit i of the leaf index, 0 = this node is the left child).
 */
export async function getMerklePath(leaves, index) {
  if (index < 0 || index >= MAX_LEAVES) throw new Error('getMerklePath: index out of range');
  const zeros = await zeroHashes();
  const pathElements = [];
  const pathIndices = [];
  let level = leaves.slice();
  let idx = index;
  for (let depth = 0; depth < TREE_DEPTH; depth++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    pathElements.push(siblingIdx < level.length ? level[siblingIdx] : zeros[depth]);
    pathIndices.push(isRight ? 1 : 0);
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : zeros[depth];
      next.push(await poseidonHash([left, right]));
    }
    if (next.length === 0) next.push(zeros[depth + 1]);
    level = next;
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices, root: level[0] };
}

/** Recompute the root from a leaf + path — the client-side mirror of the circuit check. */
export async function verifyMerklePath(leaf, path) {
  let node = leaf;
  for (let depth = 0; depth < TREE_DEPTH; depth++) {
    const sibling = path.pathElements[depth];
    node =
      path.pathIndices[depth] === 0
        ? await poseidonHash([node, sibling])
        : await poseidonHash([sibling, node]);
  }
  return node === path.root;
}
