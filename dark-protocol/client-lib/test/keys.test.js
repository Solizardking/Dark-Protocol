// Key hierarchy: ZIP-32-style derivation, determinism, domain separation,
// spend/view address equality (M-8), no cross-curve key reuse (M-12).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import {
  deriveAccountKeys,
  deriveAddressFromViewingKey,
  addressToBytes,
  indexEncryptionSecret,
  masterFromSeed,
  childHardened,
  expandKey,
  EXPAND,
} from '../src/index.js';

const seedA = new Uint8Array(32).fill(1);
const seedB = new Uint8Array(32).fill(2);

test('derivation is deterministic: same seed -> same keys', async () => {
  const a1 = await deriveAccountKeys(seedA, 0);
  const a2 = await deriveAccountKeys(seedA, 0);
  assert.equal(a1.skField, a2.skField);
  assert.equal(a1.nk, a2.nk);
  assert.equal(a1.ownerId, a2.ownerId);
  assert.deepEqual(a1.fvk.encViewingSecret, a2.fvk.encViewingSecret);
  assert.deepEqual(a1.receiptKey.publicKey, a2.receiptKey.publicKey);
});

test('different seeds and different accounts give different keys', async () => {
  const a = await deriveAccountKeys(seedA, 0);
  const b = await deriveAccountKeys(seedB, 0);
  const aAcct1 = await deriveAccountKeys(seedA, 1);
  assert.notEqual(a.skField, b.skField);
  assert.notEqual(a.ownerId, b.ownerId);
  assert.notEqual(a.skField, aAcct1.skField);
  assert.notEqual(a.ownerId, aAcct1.ownerId);
});

test('derivation is domain-separated: every labeled subkey differs', async () => {
  const master = masterFromSeed(seedA);
  const acct = childHardened(master, 0);
  const domains = [EXPAND.SPENDING, EXPAND.OUTGOING_VIEWING, EXPAND.NOTE_ENCRYPTION, EXPAND.RECEIPT_SIGNING];
  const outputs = domains.map((d) => Buffer.from(expandKey(acct.sk, d)).toString('hex'));
  assert.equal(new Set(outputs).size, domains.length);
  // hardened children differ per index too
  const c0 = childHardened(master, 0);
  const c1 = childHardened(master, 1);
  assert.notDeepEqual(c0.sk, c1.sk);
  assert.notDeepEqual(c0.chainCode, c1.chainCode);
});

test('M-8: view-only wallet derives the SAME addresses as the spending wallet', async () => {
  const keys = await deriveAccountKeys(seedA, 0);
  // The spending wallet derives addresses from its own key material...
  const spendSide = [0, 1, 2, 5].map((i) => deriveAddressFromViewingKey(keys.fvk, i));
  // ...and a view-only wallet holding ONLY the exported fvk derives identically,
  // because there is exactly one derivation function and the fvk carries
  // everything it needs (ownerId + encViewingSecret).
  const fvkOnly = {
    ownerId: keys.fvk.ownerId,
    nk: keys.fvk.nk,
    encViewingSecret: keys.fvk.encViewingSecret,
    ovk: keys.fvk.ovk,
  };
  const viewSide = [0, 1, 2, 5].map((i) => deriveAddressFromViewingKey(fvkOnly, i));
  for (let k = 0; k < spendSide.length; k++) {
    assert.deepEqual(addressToBytes(viewSide[k]), addressToBytes(spendSide[k]));
    assert.equal(viewSide[k].ownerId, keys.ownerId);
  }
  // distinct indices give distinct addresses
  assert.notDeepEqual(addressToBytes(spendSide[0]), addressToBytes(spendSide[1]));
});

test('M-12: no key reuse across curves — receipt (Ed25519), encryption (X25519) and spending (BN254) keys are independent derivations', async () => {
  const keys = await deriveAccountKeys(seedA, 0);
  const addr = deriveAddressFromViewingKey(keys.fvk, 0);
  // The receipt key is a genuine Ed25519 keypair from its own seed...
  assert.deepEqual(ed25519.getPublicKey(keys.receiptKey.secretKey), keys.receiptKey.publicKey);
  // ...the address key is a genuine X25519 keypair from a DIFFERENT secret...
  const idxSecret = indexEncryptionSecret(keys.fvk.encViewingSecret, 0);
  assert.deepEqual(x25519.getPublicKey(idxSecret), addr.encPk);
  // ...and neither secret equals the other, nor the ovk, nor the raw account key.
  assert.notDeepEqual(keys.receiptKey.secretKey, idxSecret);
  assert.notDeepEqual(keys.receiptKey.secretKey, keys.fvk.encViewingSecret);
  assert.notDeepEqual(idxSecret, keys.fvk.encViewingSecret);
  assert.notDeepEqual(keys.receiptKey.publicKey, addr.encPk);
});

test('masterFromSeed rejects bad seed lengths', () => {
  assert.throws(() => masterFromSeed(new Uint8Array(16)), /32 or 64/);
  assert.doesNotThrow(() => masterFromSeed(new Uint8Array(64).fill(3)));
});
