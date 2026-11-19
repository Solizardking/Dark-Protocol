// Spend proofs (Groth16 via snarkjs) + payment receipts.
//
// Fixes vs the old code:
//  - C-2: proofs are real Groth16 proofs produced by snarkjs from the ZK
//    track's compiled circuit artifacts — never random bytes, and there is no
//    client-side "verify" that accepts by length. (Client-side verification
//    with the circuit's verification key is supported via verifySpendProof
//    when a vkey is supplied; the authoritative check is on-chain.)
//  - M-9: a payment receipt is an Ed25519 signature by the payer over
//    (cm, nf, amount, recipient) under a dedicated domain. The old "proof"
//    was sha256(public fields || ovk) — forgeable by any viewing-key holder,
//    and its verifier returned true on structural checks alone. Here,
//    verification REQUIRES the payer's public key and a valid signature;
//    there is no keyless acceptance path.
//
// ARTIFACT CONTRACT (ZK track): artifacts live in this tree's own zk/
// directory — dark-protocol/zk/, resolved relative to this package (see
// DEFAULT_ZK_DIR below):
//     withdraw.wasm        — circuit wasm (snarkjs groth16 fullProve input)
//     withdraw.zkey        — proving key
//     withdraw.vkey.json   — verification key (optional, for local verify)
// Until those files land, createSpendProof throws ArtifactMissingError —
// it never falls back to a fabricated proof. Tests inject a stub prover to
// exercise input construction (the cryptography this module owns: Poseidon
// commitments/nullifiers/paths) without mocking any of that crypto.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { concatBytes, fieldToBytes, bigintToBytesLE } from './field.js';
import { getMerklePath } from './merkle.js';

export class ArtifactMissingError extends Error {
  constructor(missing) {
    super(
      `ZK artifacts not present (${missing.join(', ')}). ` +
        "Expected under this tree's own zk/ directory (dark-protocol/zk/) — the ZK track must " +
        'land withdraw.wasm / withdraw.zkey before real proofs can be produced. ' +
        'No fallback proof is generated.',
    );
    this.name = 'ArtifactMissingError';
    this.missing = missing;
  }
}

// Default artifact location: this tree's own zk/ directory, resolved
// from this module's location (client-lib/src/ -> ../../zk =
// dark-protocol/zk/) so the default follows the package wherever the
// tree is checked out — no donor-tree or $HOME dependency. Callers can
// still override per call via opts.zkDir / opts.artifacts, or by passing
// a directory to defaultArtifactPaths(); explicit paths always win.
export const DEFAULT_ZK_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../zk',
);

export function defaultArtifactPaths(zkDir = DEFAULT_ZK_DIR) {
  return {
    wasm: path.join(zkDir, 'withdraw.wasm'),
    zkey: path.join(zkDir, 'withdraw.zkey'),
    vkey: path.join(zkDir, 'withdraw.vkey.json'),
  };
}

function loadSnarkjs() {
  // Lazy import so the rest of the client loads even if snarkjs is absent.
  return import('snarkjs');
}

/**
 * Build the exact input object the spend circuit consumes. Exported so tests
 * (and the program track) can pin the contract:
 *   public:  root, nf, outCm, recipientOwnerId
 *   private: sk, inValue, inBlinding, leafIndex, pathElements[20],
 *            pathIndices[20], outBlinding, changeBlinding (0 if no change)
 * All values are decimal strings, as snarkjs/circom expect.
 */
export async function buildSpendInputs({
  keys, // deriveAccountKeys output (skField, nk)
  note, // input Note (must have leafIndex)
  treeLeaves, // bound-leaf array (Poseidon(cm, amount) per leaf) for path computation
  recipientOwnerId,
  amount,
  outBlinding,
  changeBlinding = 0n,
}) {
  if (note.ownerId !== keys.ownerId) throw new Error('buildSpendInputs: note not owned by keys');
  const amountBI = BigInt(amount);
  if (amountBI <= 0n || amountBI > note.value) {
    throw new Error('buildSpendInputs: amount out of range');
  }
  const change = note.value - amountBI;
  const merkle = await getMerklePath(treeLeaves, note.leafIndex);
  const nf = await note.nullifier(keys.nk);
  const { noteCommitment } = await import('./poseidon.js');
  const outCm = await noteCommitment(recipientOwnerId, amountBI, outBlinding);
  const changeCm =
    change > 0n ? await noteCommitment(keys.ownerId, change, changeBlinding) : 0n;
  const s = (x) => BigInt(x).toString();
  return {
    // public
    root: s(merkle.root),
    nf: s(nf),
    outCm: s(outCm),
    changeCm: s(changeCm),
    recipientOwnerId: s(recipientOwnerId),
    // private
    sk: s(keys.skField),
    inValue: s(note.value),
    inBlinding: s(note.blinding),
    leafIndex: s(note.leafIndex),
    pathElements: merkle.pathElements.map(s),
    pathIndices: merkle.pathIndices.map(s),
    outBlinding: s(outBlinding),
    changeBlinding: s(changeBlinding),
    // convenience for callers (not circuit inputs)
    _nf: nf,
    _root: merkle.root,
    _outCm: outCm,
    _changeCm: changeCm,
    _change: change,
  };
}

/**
 * createSpendProof(note, path, recipient, amount) — contract entry point.
 *   note: input Note; path: { treeLeaves } (bound leaves) — the Merkle path is
 *   computed here; recipient: recipient ownerId (BigInt); amount: BigInt.
 * Options: { keys, outBlinding, changeBlinding, zkDir, artifacts, snarkjsImpl }
 * `artifacts`/`snarkjsImpl` exist for tests and embedding — production callers
 * use the on-disk artifacts and the real snarkjs.
 */
export async function createSpendProof(note, pathArg, recipient, amount, opts = {}) {
  const {
    keys,
    outBlinding,
    changeBlinding = 0n,
    zkDir,
    artifacts,
    snarkjsImpl,
  } = opts;
  if (!keys) throw new Error('createSpendProof: opts.keys (deriveAccountKeys output) required');
  if (outBlinding === undefined) {
    throw new Error('createSpendProof: opts.outBlinding required (output note blinding)');
  }
  const inputs = await buildSpendInputs({
    keys,
    note,
    treeLeaves: pathArg.treeLeaves,
    recipientOwnerId: recipient,
    amount,
    outBlinding,
    changeBlinding,
  });
  const { _nf, _root, _outCm, _changeCm, _change, ...circuitInputs } = inputs;

  const paths = artifacts ?? defaultArtifactPaths(zkDir);
  const missing = [paths.wasm, paths.zkey].filter((p) => !existsSync(p));
  if (missing.length) throw new ArtifactMissingError(missing);

  const snarkjs = snarkjsImpl ?? (await loadSnarkjs());
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    paths.wasm,
    paths.zkey,
  );
  return {
    proof,
    publicSignals,
    nf: _nf,
    root: _root,
    outCm: _outCm,
    changeCm: _changeCm,
    change: _change,
  };
}

/** Optional local verification when the ZK track's vkey is available. */
export async function verifySpendProof(proof, publicSignals, opts = {}) {
  const paths = opts.artifacts ?? defaultArtifactPaths(opts.zkDir);
  if (!existsSync(paths.vkey)) throw new ArtifactMissingError([paths.vkey]);
  const vkey = JSON.parse(await readFile(paths.vkey, 'utf8'));
  const snarkjs = opts.snarkjsImpl ?? (await loadSnarkjs());
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// ---------------------------------------------------------------------------
// Payment receipts (M-9 fix): payer signature over (cm, nf, amount, recipient)
// ---------------------------------------------------------------------------

const RECEIPT_DOMAIN = new TextEncoder().encode('DarkPaymentReceipt/v1');

/** Canonical receipt message bytes — the exact thing the payer signs. */
export function receiptMessage({ cm, nf, amount, recipientOwnerId }) {
  return sha256(
    concatBytes(
      RECEIPT_DOMAIN,
      fieldToBytes(cm),
      fieldToBytes(nf),
      bigintToBytesLE(BigInt(amount), 16),
      fieldToBytes(recipientOwnerId),
    ),
  );
}

/**
 * Create a receipt: Ed25519 signature by the payer's receipt key
 * (deriveAccountKeys().receiptKey — a dedicated domain, never the spending
 * key and never the encryption key).
 */
export function createPaymentReceipt(receiptKey, fields) {
  const message = receiptMessage(fields);
  return {
    ...fields,
    payerPublicKey: receiptKey.publicKey,
    signature: ed25519.sign(message, receiptKey.secretKey),
  };
}

/**
 * Verify a receipt against an EXPECTED payer public key. There is no
 * keyless/structural acceptance path: no key, no verification.
 */
export function verifyPaymentReceipt(receipt, expectedPayerPublicKey) {
  if (!receipt || !expectedPayerPublicKey) return false;
  try {
    if (
      Buffer.compare(Buffer.from(receipt.payerPublicKey), Buffer.from(expectedPayerPublicKey)) !== 0
    ) {
      return false;
    }
    const message = receiptMessage(receipt);
    return ed25519.verify(receipt.signature, message, expectedPayerPublicKey);
  } catch {
    return false;
  }
}
