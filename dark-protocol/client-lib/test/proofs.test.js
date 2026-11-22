// Spend-proof interface + payment receipts.
//
// Proof tests: (a) with a bogus artifact directory the real path must fail
// loudly with ArtifactMissingError — never fabricate a proof (C-2) — and
// (b) input construction is exercised with a stub prover injected at the
// artifact/prover seam only. Every cryptographic value fed to the stub
// (nf, cm, root, path) is computed by the real Poseidon code and asserted
// here. (Real end-to-end proving against the landed artifacts lives in
// withdraw-integration.test.js.)
//
// Receipt tests: an Ed25519 signature by the payer over (cm, nf, amount,
// recipient) — nothing forgeable by hashing public data (M-9), and no
// keyless acceptance path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  deriveAccountKeys,
  Note,
  createSpendProof,
  buildSpendInputs,
  ArtifactMissingError,
  createPaymentReceipt,
  verifyPaymentReceipt,
} from '../src/index.js';

const seed = new Uint8Array(32).fill(21);

async function spendFixture() {
  const keys = await deriveAccountKeys(seed, 0);
  const recipient = await deriveAccountKeys(new Uint8Array(32).fill(22), 0);
  const note = new Note({ ownerId: keys.ownerId, value: 100n, blinding: 999n, leafIndex: 0 });
  const decoy = new Note({ ownerId: recipient.ownerId, value: 7n, blinding: 5n, leafIndex: 1 });
  // tree leaves are bound leaves Poseidon(cm, amount) since the NEW-1 fix
  const leaves = [await note.boundLeaf(), await decoy.boundLeaf()];
  return { keys, recipient, note, leaves };
}

test('missing ZK artifacts -> ArtifactMissingError, never a fabricated proof (C-2)', async () => {
  const { keys, recipient, note, leaves } = await spendFixture();
  await assert.rejects(
    () =>
      createSpendProof(note, { treeLeaves: leaves }, recipient.ownerId, 40n, {
        keys,
        outBlinding: 1234n,
        zkDir: '/nonexistent-zk-dir',
      }),
    (err) => err instanceof ArtifactMissingError && /withdraw\.wasm/.test(err.message),
  );
});

test('spend inputs are built from real Poseidon crypto (stub prover at the seam only)', async () => {
  const { keys, recipient, note, leaves } = await spendFixture();
  const inputs = await buildSpendInputs({
    keys,
    note,
    treeLeaves: leaves,
    recipientOwnerId: recipient.ownerId,
    amount: 40n,
    outBlinding: 1234n,
    changeBlinding: 555n,
  });
  // nullifier is the real Poseidon(nk, leafIndex)
  assert.equal(BigInt(inputs.nf), await note.nullifier(keys.nk));
  // output commitment opens against (recipient, 40, outBlinding)
  const { noteCommitment } = await import('../src/poseidon.js');
  assert.equal(BigInt(inputs.outCm), await noteCommitment(recipient.ownerId, 40n, 1234n));
  // change commitment is for the remaining 60 back to the spender
  assert.equal(BigInt(inputs.changeCm), await noteCommitment(keys.ownerId, 60n, 555n));
  // path shape matches the circuit contract
  assert.equal(inputs.pathElements.length, 20);
  assert.equal(inputs.pathIndices.length, 20);
  assert.equal(inputs.leafIndex, '0');

  // full createSpendProof with an injected stub prover + fake artifact paths
  // that exist (this file): asserts the module hands snarkjs the real inputs.
  let seen = null;
  const stubSnarkjs = {
    groth16: {
      fullProve: async (circuitInputs, wasm, zkey) => {
        seen = { circuitInputs, wasm, zkey };
        return { proof: { pi_a: ['stub'] }, publicSignals: [circuitInputs.root, circuitInputs.nf] };
      },
    },
  };
  const res = await createSpendProof(note, { treeLeaves: leaves }, recipient.ownerId, 40n, {
    keys,
    outBlinding: 1234n,
    changeBlinding: 555n,
    artifacts: { wasm: import.meta.filename, zkey: import.meta.filename },
    snarkjsImpl: stubSnarkjs,
  });
  assert.ok(seen);
  assert.equal(seen.circuitInputs.nf, inputs.nf);
  assert.equal(res.nf, await note.nullifier(keys.nk));
  assert.equal(res.change, 60n);
});

test('overspend is rejected before any proving', async () => {
  const { keys, recipient, note, leaves } = await spendFixture();
  await assert.rejects(
    () =>
      buildSpendInputs({
        keys,
        note,
        treeLeaves: leaves,
        recipientOwnerId: recipient.ownerId,
        amount: 101n,
        outBlinding: 1n,
      }),
    /amount out of range/,
  );
});

test('payment receipt: payer signature verifies, forgery does not (M-9)', async () => {
  const { keys, note } = await spendFixture();
  const recipient = await deriveAccountKeys(new Uint8Array(32).fill(23), 0);
  const fields = {
    cm: await note.commitment(),
    nf: await note.nullifier(keys.nk),
    amount: 40n,
    recipientOwnerId: recipient.ownerId,
  };
  const receipt = createPaymentReceipt(keys.receiptKey, fields);
  assert.equal(verifyPaymentReceipt(receipt, keys.receiptKey.publicKey), true);

  // tampered amount -> signature no longer matches the message
  assert.equal(verifyPaymentReceipt({ ...receipt, amount: 41n }, keys.receiptKey.publicKey), false);
  // wrong expected payer -> rejected
  assert.equal(verifyPaymentReceipt(receipt, recipient.receiptKey.publicKey), false);
  // no expected key -> NO keyless acceptance path (the old verifier said true)
  assert.equal(verifyPaymentReceipt(receipt, null), false);
  assert.equal(verifyPaymentReceipt(receipt, undefined), false);
  // attacker fabricating a receipt with their own key, claiming to be the payer
  const attackerSk = new Uint8Array(32).fill(99);
  const forged = createPaymentReceipt(
    { secretKey: attackerSk, publicKey: ed25519.getPublicKey(attackerSk) },
    fields,
  );
  assert.equal(verifyPaymentReceipt(forged, keys.receiptKey.publicKey), false);
  // garbage signature bytes
  assert.equal(
    verifyPaymentReceipt({ ...receipt, signature: new Uint8Array(64) }, keys.receiptKey.publicKey),
    false,
  );
});
