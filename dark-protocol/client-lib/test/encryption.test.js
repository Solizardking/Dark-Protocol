// Note encryption: real X25519 DH — round-trip, wrong-key failure, tampering.
// These are the tests the old code could never pass (audit C-5/H-5/H-6):
// its "shared secret" was two unrelated hashes, its nonce handling broke its
// own parser, and its ephemeral key was a deterministic hash of the rseed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountKeys,
  deriveAddressFromViewingKey,
  indexEncryptionSecret,
  Note,
  encryptNote,
  decryptNote,
  tryDecryptNote,
  parseWireCiphertext,
  WIRE_VERSION,
} from '../src/index.js';

const seed = new Uint8Array(32).fill(42);

async function fixture() {
  const keys = await deriveAccountKeys(seed, 0);
  const address = deriveAddressFromViewingKey(keys.fvk, 3);
  const secret = indexEncryptionSecret(keys.fvk.encViewingSecret, 3);
  return { keys, address, secret };
}

test('encrypt -> decrypt round-trip recovers the exact note', async () => {
  const { keys, address, secret } = await fixture();
  const note = Note.create(keys.ownerId, 123456789n);
  const wire = encryptNote(address.encPk, note);
  const dec = decryptNote(secret, wire);
  assert.equal(dec.value, note.value);
  assert.equal(dec.blinding, note.blinding);
  assert.equal(dec.ownerId, note.ownerId);
});

test('decryption with the WRONG key fails (DH actually binds the key)', async () => {
  const { keys, address } = await fixture();
  const other = await deriveAccountKeys(new Uint8Array(32).fill(9), 0);
  const wrongSecret = indexEncryptionSecret(other.fvk.encViewingSecret, 3);
  const wire = encryptNote(address.encPk, Note.create(keys.ownerId, 5n));
  assert.throws(() => decryptNote(wrongSecret, wire));
  assert.equal(tryDecryptNote(wrongSecret, wire), null);
});

test('decryption at the WRONG address index fails', async () => {
  const { keys, address, secret } = await fixture();
  const wrongIndexSecret = indexEncryptionSecret(keys.fvk.encViewingSecret, 4);
  const wire = encryptNote(address.encPk, Note.create(keys.ownerId, 5n));
  assert.throws(() => decryptNote(wrongIndexSecret, wire));
  // and the right index still works
  assert.equal(decryptNote(secret, wire).value, 5n);
});

test('tampered ciphertext fails the Poly1305 tag check', async () => {
  const { keys, address, secret } = await fixture();
  const wire = encryptNote(address.encPk, Note.create(keys.ownerId, 5n));
  const tampered = wire.slice();
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => decryptNote(secret, tampered));
});

test('wire format parses back into its documented components', async () => {
  const { keys, address } = await fixture();
  const wire = encryptNote(address.encPk, Note.create(keys.ownerId, 5n));
  const parsed = parseWireCiphertext(wire);
  assert.equal(parsed.version, WIRE_VERSION);
  assert.equal(parsed.ephemeralPk.length, 32);
  assert.equal(parsed.nonce.length, 12);
  // 80-byte plaintext + 16-byte tag
  assert.equal(parsed.ciphertext.length, 80 + 16);
  assert.equal(wire.length, 1 + 32 + 12 + 96);
});

test('ephemeral key is fresh per note (H-6): same note encrypts differently twice', async () => {
  const { keys, address, secret } = await fixture();
  const note = Note.create(keys.ownerId, 77n);
  const a = encryptNote(address.encPk, note);
  const b = encryptNote(address.encPk, note);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(parseWireCiphertext(a).ephemeralPk, parseWireCiphertext(b).ephemeralPk);
  // both still decrypt to the same note
  assert.equal(decryptNote(secret, a).value, 77n);
  assert.equal(decryptNote(secret, b).value, 77n);
});

test('bad version byte is rejected', async () => {
  const { keys, address, secret } = await fixture();
  const wire = encryptNote(address.encPk, Note.create(keys.ownerId, 5n));
  const bad = wire.slice();
  bad[0] = 0x7f;
  assert.throws(() => decryptNote(secret, bad), /unsupported version/);
});
