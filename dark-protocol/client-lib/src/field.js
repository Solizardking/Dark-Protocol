// BN254 scalar field (Fr) helpers.
//
// Everything in-circuit in the Dark DeFi rewrite lives over the BN254 scalar
// field, so that the TypeScript client and the Circom/Groth16 circuit (ZK
// track) agree on exactly the same arithmetic. All field elements are BigInts
// reduced mod FR_MODULUS.

export const FR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Reduce any integer into [0, FR_MODULUS). */
export function modFr(x) {
  const v = BigInt(x) % FR_MODULUS;
  return v >= 0n ? v : v + FR_MODULUS;
}

/** BigInt -> big-endian bytes of fixed length. Throws if it does not fit. */
export function bigintToBytesBE(x, length) {
  let v = BigInt(x);
  if (v < 0n) throw new Error('bigintToBytesBE: negative value');
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`bigintToBytesBE: value does not fit in ${length} bytes`);
  return out;
}

/** BigInt -> little-endian bytes of fixed length. Throws if it does not fit. */
export function bigintToBytesLE(x, length) {
  let v = BigInt(x);
  if (v < 0n) throw new Error('bigintToBytesLE: negative value');
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`bigintToBytesLE: value does not fit in ${length} bytes`);
  return out;
}

export function bytesToBigintBE(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export function bytesToBigintLE(bytes) {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

/** Field element -> 32-byte big-endian encoding (canonical circuit encoding). */
export function fieldToBytes(x) {
  return bigintToBytesBE(modFr(x), 32);
}

export function bytesToField(bytes) {
  if (bytes.length !== 32) throw new Error('bytesToField: expected 32 bytes');
  return modFr(bytesToBigintBE(bytes));
}

export function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Uniform-ish random field element from 64 random bytes (bias negligible). */
export function randomFieldElement() {
  return modFr(bytesToBigintBE(randomBytes(64)));
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += HEX[b];
  return s;
}
export function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error('hexToBytes: odd length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
