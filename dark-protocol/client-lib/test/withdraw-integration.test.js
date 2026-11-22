// Withdraw integration: client crypto -> real Groth16 proof -> client verify,
// against the ZK track's landed artifacts in this tree's own zk/ directory
// (dark-protocol/zk/, reached via defaultArtifactPaths()).
//
// This is the cross-layer check the tracks were wired against:
//   - the client's Poseidon matches the on-chain program's light-poseidon
//     known-answer vector (and the circuit's agreement is proven by the
//     proof below verifying — three-way agreement);
//   - a note built entirely with client code (keys, commitment, bound leaf,
//     Merkle path, nullifier) produces a proof the client's own verifier
//     accepts, with public signals in contract order;
//   - the NEW-1 drain fails from the client side too: a note whose
//     commitment claims V=1,000,000, sitting in the tree under the bound
//     leaf of a 1-lamport deposit, cannot be proven at amount V.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountKeys,
  Note,
  poseidonHash,
  boundLeaf,
  computeRoot,
  getMerklePath,
  verifySpendProof,
  defaultArtifactPaths,
} from '../src/index.js';

const snarkjsMod = await import('snarkjs');
const snarkjs = snarkjsMod.groth16 ? snarkjsMod : snarkjsMod.default;

// snarkjs/ffjavascript keep a worker-thread pool alive after
// groth16.fullProve / groth16.verify; without terminating it the test
// process never exits (the zk e2e script avoids this via process.exit).
// Terminate the shared bn128 curve pool once all tests in this file ran.
after(async () => {
  const curve = await snarkjs.curves.getCurveFromName('bn128');
  await curve.terminate();
});

// A fixed 32-byte recipient "pubkey"; the recipient field is
// Poseidon(hi128, lo128) of its two big-endian 16-byte halves — the same
// encoding the program computes on-chain (poseidon::recipient_field).
const RECIPIENT_PUBKEY = Buffer.from(
  'DarkDefiRecipient11111111111111111111111111'.padEnd(32, '1').slice(0, 32),
  'utf8',
);
async function recipientField() {
  const hi = BigInt('0x' + RECIPIENT_PUBKEY.subarray(0, 16).toString('hex'));
  const lo = BigInt('0x' + RECIPIENT_PUBKEY.subarray(16, 32).toString('hex'));
  return poseidonHash([hi, lo]);
}

async function withdrawInput({ keys, note, leaves }) {
  const merkle = await getMerklePath(leaves, note.leafIndex);
  const nf = await note.nullifier(keys.nk);
  const s = (x) => BigInt(x).toString();
  return {
    root: s(merkle.root),
    nf: s(nf),
    recipient: s(await recipientField()),
    amount: s(note.value),
    sk: s(keys.skField),
    blinding: s(note.blinding),
    leafIndex: s(note.leafIndex),
    pathElements: merkle.pathElements.map(s),
    pathIndices: merkle.pathIndices.map(s),
  };
}

test('client Poseidon matches the program light-poseidon known-answer vector', async () => {
  // The program's poseidon2 KAT (program/src/poseidon.rs): inputs are the
  // 32-byte big-endian encodings 0x0101..01 and 0x0202..02.
  const h = await poseidonHash([
    BigInt('0x' + '01'.repeat(32)),
    BigInt('0x' + '02'.repeat(32)),
  ]);
  assert.equal(h, 6030039056180688046538272648816150486962996124743416649616624837554616801680n);
});

test('honest withdraw: client-built note proves and verifies end to end', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(31), 0);
  const note = new Note({ ownerId: keys.ownerId, value: 5000n, blinding: 424242n, leafIndex: 0 });
  const decoy = new Note({ ownerId: keys.ownerId + 7n, value: 9n, blinding: 111n, leafIndex: 1 });
  const leaves = [await note.boundLeaf(), await decoy.boundLeaf()];
  assert.equal(await computeRoot(leaves), (await getMerklePath(leaves, 0)).root);

  const input = await withdrawInput({ keys, note, leaves });
  const paths = defaultArtifactPaths();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, paths.wasm, paths.zkey);

  // public signals in contract order [root, nf, recipient, amount]
  assert.deepEqual(publicSignals, [input.root, input.nf, input.recipient, input.amount]);
  assert.equal(await verifySpendProof(proof, publicSignals), true);

  // tampered amount (+1) is rejected by the same verifier
  const tampered = publicSignals.slice();
  tampered[3] = (BigInt(tampered[3]) + 1n).toString();
  assert.equal(await verifySpendProof(proof, tampered), false);
});

test('NEW-1 drain: a 1-lamport deposit of a V=1,000,000 commitment cannot be proven at V', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(32), 0);
  const V = 1_000_000n;
  const note = new Note({ ownerId: keys.ownerId, value: V, blinding: 777n, leafIndex: 0 });
  const cm = await note.commitment();
  // The tree slot holds what the program would insert for a 1-lamport
  // deposit of this commitment: the bound leaf Poseidon(cm, 1).
  const leaves = [await boundLeaf(cm, 1n)];
  const input = await withdrawInput({ keys, note, leaves });
  const paths = defaultArtifactPaths();
  let verified = false;
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, paths.wasm, paths.zkey);
    verified = await verifySpendProof(proof, publicSignals);
  } catch {
    verified = false; // witness generation failed: constraints unsatisfiable
  }
  assert.equal(verified, false);
});
