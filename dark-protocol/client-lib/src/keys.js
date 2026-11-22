// Key hierarchy — ZIP-32-STYLE hardened derivation, honestly labeled.
//
// WHAT THIS IS: the ZIP-32 *construction shape* — a master key derived from
// the seed under a protocol personalization, split into (key, chain code),
// hardened-only child derivation, and PRF^expand-style labeled subkey
// expansion — re-instantiated with BLAKE2b-512 keyed hashing under OUR OWN
// personalization domain "DarkZIP32".
//
// WHAT THIS IS NOT: Zcash ZIP-32. Real ZIP-32 uses BLAKE2b-512 with the
// 16-byte personalization "ZcashIP32Sapling" (spanning the BLAKE2b salt and
// personal parameter fields), Jubjub key components (ask/nsk/ovk), and
// PRF^expand domain bytes fixed by the Zcash protocol. Our domain strings,
// subkey labels, and downstream curve usage (BN254 field elements, X25519,
// Ed25519) all differ. Keys from this module are NOT interoperable with any
// Zcash/Sapling wallet, and addresses are NOT Sapling addresses. The old code
// claimed that compatibility (audit I-5/C-3); this module exists precisely to
// stop claiming it. This is Sapling-ARCHITECTURE, not Sapling.
//
// Fixes vs the old code:
//  - C-3: real hierarchical derivation with chain codes and hardened child
//    derivation replaces Blake3(seed || label) one-shot hashing.
//  - M-12: no secp256k1 BIP32 anywhere, and no key material is shared across
//    curves. Every subkey comes out of PRF^expand under a distinct labeled
//    domain (see EXPAND below): the BN254 spending key, the X25519 note-
//    encryption viewing secret, and the Ed25519 receipt-signing key are three
//    independent derivations. Compromise or misuse of one domain reveals
//    nothing about the others.
//  - M-8: spending and viewing wallets share ONE address-derivation function
//    (deriveAddressFromViewingKey below); the viewing key carries everything
//    address derivation needs, so a view-only wallet reproduces the spending
//    wallet's addresses exactly.

import { blake2b } from '@noble/hashes/blake2b.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  FR_MODULUS,
  bytesToBigintBE,
  concatBytes,
  fieldToBytes,
} from './field.js';
import { deriveNullifierKey, deriveOwnerId } from './poseidon.js';

const utf8 = (s) => new TextEncoder().encode(s);

/** Our personalization domain. NOT "ZcashIP32Sapling" — see header. */
export const MASTER_DOMAIN = 'DarkZIP32';

/** Labeled PRF^expand domains. One label per key purpose — never reused. */
export const EXPAND = {
  SPENDING: 0x00, // -> BN254 spending key (field element)
  OUTGOING_VIEWING: 0x01, // -> ovk-analog: receipt/payment-proof viewing material
  NOTE_ENCRYPTION: 0x02, // -> X25519 viewing secret (note decryption + addresses)
  RECEIPT_SIGNING: 0x03, // -> Ed25519 key for payment receipts
};

function blake2b512(data, key) {
  return blake2b(data, { dkLen: 64, key });
}

function u32be(n) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

/**
 * Master key from seed, ZIP-32 shape:
 *   I = BLAKE2b-512(key = "DarkZIP32", data = seed); sk_m = I[0..32], c_m = I[32..64].
 * Seed must be 32 or 64 bytes (use a CSPRNG or a KDF output — never a password
 * directly; this module does not stretch passwords).
 */
export function masterFromSeed(seed) {
  if (!(seed instanceof Uint8Array) || (seed.length !== 32 && seed.length !== 64)) {
    throw new Error('masterFromSeed: seed must be 32 or 64 bytes');
  }
  const I = blake2b512(seed, utf8(MASTER_DOMAIN));
  return { sk: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/**
 * Hardened child derivation, ZIP-32 shape (hardened-only, like ZIP-32):
 *   I = BLAKE2b-512(key = c_par, data = 0x00 || sk_par || u32be(index + 2^31))
 * Returns { sk, chainCode }.
 */
export function childHardened(parent, index) {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) {
    throw new Error('childHardened: index out of range');
  }
  const data = concatBytes(new Uint8Array([0x00]), parent.sk, u32be(index + 2 ** 31));
  const I = blake2b512(data, parent.chainCode);
  return { sk: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/**
 * PRF^expand analog: BLAKE2b-512(key = sk, data = [domainByte]) -> 64 bytes.
 * Distinct domain bytes give cryptographically separated subkeys.
 */
export function expandKey(sk, domainByte) {
  return blake2b512(new Uint8Array([domainByte]), sk);
}

/**
 * A full account key set derived from a seed at a ZIP-32-style path
 * (master -> account index, hardened). Async because owner_id / nk are
 * Poseidon outputs (shared contract).
 *
 * Returns:
 *  - skField:    BN254 spending key (BigInt in Fr). THE spending secret.
 *  - nk:         Poseidon(sk, 0) — nullifier key (BigInt).
 *  - ownerId:    Poseidon(sk, 1) — public owner identifier (BigInt).
 *  - fvk:        full viewing key { ownerId, nk, encViewingSecret, ovk } —
 *                everything a view-only wallet needs to derive the SAME
 *                addresses and decrypt incoming notes. Cannot spend.
 *  - receiptKey: independent Ed25519 keypair for payment receipts (M-9 fix).
 */
export async function deriveAccountKeys(seed, accountIndex = 0) {
  const master = masterFromSeed(seed);
  const account = childHardened(master, accountIndex);

  // Spending key: expand under the SPENDING domain, reduce into Fr.
  // Rejection-sample the negligible chance of 0 (a zero spending key would
  // make nk/ownerId key-independent constants).
  let skField = 0n;
  for (let counter = 0; skField === 0n; counter++) {
    const material = expandKey(account.sk, EXPAND.SPENDING);
    const candidate = bytesToBigintBE(concatBytes(material, new Uint8Array([counter]))) % FR_MODULUS;
    // counter only enters on the (astronomically unlikely) retry; the first
    // candidate uses counter = 0 appended — deterministic either way.
    skField = candidate;
  }

  const nk = await deriveNullifierKey(skField);
  const ownerId = await deriveOwnerId(skField);

  const ovk = expandKey(account.sk, EXPAND.OUTGOING_VIEWING).slice(0, 32);
  const encViewingSecret = expandKey(account.sk, EXPAND.NOTE_ENCRYPTION).slice(0, 32);

  const receiptSeed = expandKey(account.sk, EXPAND.RECEIPT_SIGNING).slice(0, 32);
  const receiptKey = {
    secretKey: receiptSeed,
    publicKey: ed25519.getPublicKey(receiptSeed),
  };

  return {
    skField,
    nk,
    ownerId,
    fvk: { ownerId, nk, encViewingSecret, ovk },
    receiptKey,
    // Exposed for tests/diagnostics: raw node keys (never serialize casually).
    _accountNode: account,
  };
}

/**
 * Per-index X25519 secret for note encryption / addresses.
 *   secret_i = HKDF-SHA256(ikm = encViewingSecret, info = "DarkAddr/<index>", 32)
 * Both wallet types call this — there is exactly one derivation path.
 */
export function indexEncryptionSecret(encViewingSecret, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error('indexEncryptionSecret: bad index');
  return hkdf(sha256, encViewingSecret, undefined, utf8(`DarkAddr/${index}`), 32);
}

/**
 * THE address derivation function (M-8 fix). Used identically by the spending
 * wallet and the view-only wallet.
 *
 * Address = { index, ownerId, encPk } where encPk is the X25519 public key of
 * the per-index encryption secret. Wire encoding (64 bytes):
 *   ownerId (32B BE) || encPk (32B)
 * NOTE: 64 bytes, deliberately NOT Sapling's 43-byte format — we do not claim
 * Sapling compatibility anywhere, including in the address length.
 */
export function deriveAddressFromViewingKey(fvk, index) {
  const secret = indexEncryptionSecret(fvk.encViewingSecret, index);
  const encPk = x25519.getPublicKey(secret);
  return { index, ownerId: fvk.ownerId, encPk };
}

export function addressToBytes(address) {
  return concatBytes(fieldToBytes(address.ownerId), address.encPk);
}
