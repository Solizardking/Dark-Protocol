// Notes, commitments, nullifiers — per the shared design contract.
//
//   cm   = Poseidon(owner_id, value, blinding)
//   leaf = Poseidon(cm, value)   — the deposit-bound leaf the tree holds
//   nf   = Poseidon(nk, leaf_index)
//
// The leaf binding is the NEW-1 fix: the on-chain program computes
// Poseidon(cm, amount) at deposit from the lamports it actually pulled,
// so a note can only ever be spent for exactly the amount deposited
// against its commitment. Deposit preparation must therefore always go
// through boundLeaf() — a tree built over raw commitments describes a
// pool that no longer exists.
//
// Fixes vs the old code:
//  - H-7: the commitment is a Poseidon hash over (owner, value, blinding)
//    with a uniformly random 254-bit blinding — the same object the spend
//    circuit opens. It binds the value: recomputing with a tampered value
//    yields a different commitment (proven in tests). The old code hashed the
//    ASCII decimal digits of the value with the raw rseed embedded.
//  - C-6: the nullifier is a deterministic Poseidon PRF of the nullifier key
//    and the note's leaf index — same note, same nullifier (double-spend
//    detectable), different leaf, different nullifier. The old code used
//    random bytes, zeros, or a Blake3 construction bound to nothing the
//    circuit could check.

import { modFr, randomFieldElement } from './field.js';
import {
  noteCommitment,
  boundLeaf as computeBoundLeaf,
  nullifier as computeNullifier,
} from './poseidon.js';

export const MAX_VALUE = 2n ** 128n; // values are u128, as in the note plaintext format

/**
 * A shielded note. `blinding` is the commitment randomness (rcm analog) — a
 * field element, never the raw seed of anything else (H-6: the old code
 * derived the ephemeral encryption key deterministically from the note rseed;
 * here encryption randomness is independent, see encryption.js).
 */
export class Note {
  constructor({ ownerId, value, blinding, leafIndex = null }) {
    this.ownerId = modFr(ownerId);
    this.value = BigInt(value);
    if (this.value < 0n || this.value >= MAX_VALUE) {
      throw new Error('Note: value out of u128 range');
    }
    this.blinding = modFr(blinding);
    this.leafIndex = leafIndex; // position in the commitment tree, once known
  }

  static create(ownerId, value) {
    return new Note({ ownerId, value, blinding: randomFieldElement() });
  }

  /** cm = Poseidon(owner_id, value, blinding). */
  async commitment() {
    return noteCommitment(this.ownerId, this.value, this.blinding);
  }

  /**
   * The deposit-bound leaf for this note: Poseidon(cm, value). This is
   * what the program inserts at deposit (computing it from the deposited
   * amount, which for a well-formed deposit equals this note's value) and
   * what off-chain tree builders must insert to mirror the pool.
   */
  async boundLeaf() {
    return computeBoundLeaf(await this.commitment(), this.value);
  }

  /** nf = Poseidon(nk, leaf_index). Requires the note's leaf index. */
  async nullifier(nk) {
    if (this.leafIndex === null || this.leafIndex === undefined) {
      throw new Error('Note.nullifier: leafIndex unknown — note not yet in the tree');
    }
    return computeNullifier(nk, BigInt(this.leafIndex));
  }
}

/**
 * Open a commitment: recompute cm from the claimed note contents and compare.
 * Returns true iff (ownerId, value, blinding) is exactly the committed tuple —
 * any tampering (e.g. a larger value) fails.
 */
export async function openCommitment(commitment, { ownerId, value, blinding }) {
  const recomputed = await noteCommitment(ownerId, value, blinding);
  return recomputed === modFr(commitment);
}
