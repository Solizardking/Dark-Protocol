// Note encryption — REAL Diffie–Hellman, fixing C-5/H-5/H-6 by construction.
//
// THE OLD BUG (C-5): the sender computed the shared secret as
// blake3(esk || pk_d || label) and the receiver as blake3(ivk || epk || label).
// Two unrelated hashes of different inputs — decryption was mathematically
// impossible, not merely buggy.
//
// HERE: X25519 (@noble/curves). The sender generates a fresh ephemeral
// keypair per note and computes
//     shared = X25519(ephemeral_sk, recipient_pk)
// The receiver computes
//     shared = X25519(recipient_sk, ephemeral_pk)
// and X25519's group law makes these THE SAME secret by construction — the
// round-trip is proven by tests, including wrong-key failure.
//
// Fresh ephemeral randomness per note (never derived from the note's rseed —
// H-6) means learning one note's contents reveals nothing about any other
// note's encryption key.
//
// Key derivation: HKDF-SHA256(ikm = shared, salt = ephemeral_pk,
// info = "DarkNoteEnc/v1") -> 32-byte ChaCha20-Poly1305 key (@noble/ciphers).
//
// WIRE FORMAT (fixed, versioned, round-tripping — H-5):
//   byte  0        : version = 0x01
//   bytes 1..33    : ephemeral X25519 public key (32B)
//   bytes 33..45   : ChaCha20-Poly1305 nonce (12B, random per note)
//   bytes 45..     : ciphertext || 16B Poly1305 tag
// Total for the standard 80-byte note plaintext: 141 bytes. The parser below
// reads exactly this layout; there is no fixed-size truncation anywhere (the
// old code truncated ciphertexts into 580/80-byte arrays and threw the nonce
// away — nothing here does that).
//
// NOTE PLAINTEXT (80 bytes, fixed layout):
//   bytes 0..16    : value, u128 little-endian
//   bytes 16..48   : blinding, 32B big-endian field encoding
//   bytes 48..80   : ownerId, 32B big-endian field encoding
// (Memo support is deliberately out of scope for this layer; a future format
// version can add an enc-memo box the way Sapling separates the two.)

import { x25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha256.js';
import {
  bigintToBytesBE,
  bigintToBytesLE,
  bytesToBigintBE,
  bytesToBigintLE,
  concatBytes,
  modFr,
  randomBytes,
} from './field.js';

export const WIRE_VERSION = 0x01;
export const NOTE_PLAINTEXT_SIZE = 80;
const KDF_INFO = new TextEncoder().encode('DarkNoteEnc/v1');

export function serializeNotePlaintext({ value, blinding, ownerId }) {
  return concatBytes(
    bigintToBytesLE(BigInt(value), 16),
    bigintToBytesBE(modFr(blinding), 32),
    bigintToBytesBE(modFr(ownerId), 32),
  );
}

export function parseNotePlaintext(bytes) {
  if (bytes.length !== NOTE_PLAINTEXT_SIZE) {
    throw new Error(`parseNotePlaintext: expected ${NOTE_PLAINTEXT_SIZE} bytes, got ${bytes.length}`);
  }
  return {
    value: bytesToBigintLE(bytes.slice(0, 16)),
    blinding: bytesToBigintBE(bytes.slice(16, 48)),
    ownerId: bytesToBigintBE(bytes.slice(48, 80)),
  };
}

function deriveAeadKey(sharedSecret, ephemeralPk) {
  return hkdf(sha256, sharedSecret, ephemeralPk, KDF_INFO, 32);
}

/**
 * Encrypt a note to a recipient's X25519 encryption public key (from
 * deriveAddressFromViewingKey). Returns the wire-format bytes.
 */
export function encryptNote(recipientEncPk, noteFields) {
  if (recipientEncPk.length !== 32) throw new Error('encryptNote: encPk must be 32 bytes');
  const ephemeralSk = x25519.utils.randomSecretKey();
  const ephemeralPk = x25519.getPublicKey(ephemeralSk);
  const shared = x25519.getSharedSecret(ephemeralSk, recipientEncPk);
  const key = deriveAeadKey(shared, ephemeralPk);
  const nonce = randomBytes(12);
  const plaintext = serializeNotePlaintext(noteFields);
  const ciphertext = chacha20poly1305(key, nonce).encrypt(plaintext);
  return concatBytes(new Uint8Array([WIRE_VERSION]), ephemeralPk, nonce, ciphertext);
}

/** Parse wire bytes into their components without decrypting. */
export function parseWireCiphertext(wire) {
  if (wire.length < 1 + 32 + 12 + 16) throw new Error('parseWireCiphertext: too short');
  if (wire[0] !== WIRE_VERSION) {
    throw new Error(`parseWireCiphertext: unsupported version ${wire[0]}`);
  }
  return {
    version: wire[0],
    ephemeralPk: wire.slice(1, 33),
    nonce: wire.slice(33, 45),
    ciphertext: wire.slice(45),
  };
}

/**
 * Decrypt a wire ciphertext with the recipient's per-index X25519 secret
 * (indexEncryptionSecret of the address the note was sent to).
 * Throws on wrong key or any tampering (Poly1305 tag check).
 */
export function decryptNote(recipientIndexSecret, wire) {
  const { ephemeralPk, nonce, ciphertext } = parseWireCiphertext(wire);
  // The other half of the DH equality: X25519(recipient_sk, ephemeral_pk)
  // === X25519(ephemeral_sk, recipient_pk). Same secret, by group law.
  const shared = x25519.getSharedSecret(recipientIndexSecret, ephemeralPk);
  const key = deriveAeadKey(shared, ephemeralPk);
  const plaintext = chacha20poly1305(key, nonce).decrypt(ciphertext);
  return parseNotePlaintext(plaintext);
}

/** Trial-decrypt helper for wallet scanning: returns the note or null. */
export function tryDecryptNote(recipientIndexSecret, wire) {
  try {
    return decryptNote(recipientIndexSecret, wire);
  } catch {
    return null;
  }
}
