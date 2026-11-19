// Poseidon over BN254 — circomlib-compatible parameters.
//
// PARAMETER CHOICE (shared design contract): we use the Poseidon instance
// from circomlibjs (buildPoseidon), which is the reference implementation the
// Circom circuits in the ZK track compile against (circomlib's poseidon
// circuit templates use identical round constants / MDS matrix). Client and
// circuit therefore produce identical hashes for identical inputs, provided
// inputs are reduced into the BN254 scalar field first (done here).
//
// CROSS-CHECK STATUS: verified three ways (re-audit §2, re-verified after
// the NEW-1 circuit change — the Poseidon instance itself did not change).
// The test suite pins the standard circomlib vector; the circuit e2e proves
// JS-computed values inside the compiled circuit; the on-chain program's
// light-poseidon known-answer test produces the identical output for the
// identical inputs. Any parameter drift fails loudly in one of the three.

import { buildPoseidon } from 'circomlibjs';
import { modFr } from './field.js';

let _poseidon = null;
let _F = null;

export async function getPoseidon() {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return _poseidon;
}

/**
 * Poseidon hash of 1..16 field elements -> BigInt in Fr.
 * Async because circomlibjs builds its instance asynchronously.
 */
export async function poseidonHash(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 16) {
    throw new Error('poseidonHash: expected 1..16 inputs');
  }
  const poseidon = await getPoseidon();
  const reduced = inputs.map((x) => modFr(x));
  return _F.toObject(poseidon(reduced));
}

/** nk = Poseidon(sk, 0) — nullifier key (shared contract). */
export async function deriveNullifierKey(sk) {
  return poseidonHash([sk, 0n]);
}

/** owner_id = Poseidon(sk, 1) — public note owner identifier (shared contract). */
export async function deriveOwnerId(sk) {
  return poseidonHash([sk, 1n]);
}

/** cm = Poseidon(owner_id, value, blinding) — note commitment (shared contract). */
export async function noteCommitment(ownerId, value, blinding) {
  return poseidonHash([ownerId, value, blinding]);
}

/**
 * leaf = Poseidon(cm, amount) — the deposit-bound Merkle leaf (shared
 * contract, re-audit NEW-1 fix). The on-chain program computes this at
 * deposit from the lamports it pulled; the tree holds bound leaves, never
 * raw commitments. A note is therefore spendable only for exactly the
 * amount that was deposited against its commitment.
 */
export async function boundLeaf(cm, amount) {
  return poseidonHash([cm, amount]);
}

/** nf = Poseidon(nk, leaf_index) — nullifier (shared contract). */
export async function nullifier(nk, leafIndex) {
  return poseidonHash([nk, leafIndex]);
}
