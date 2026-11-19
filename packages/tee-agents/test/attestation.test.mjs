// Run after `npm run build`: node --test test/attestation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTeeQuote,
  importHardwareQuote,
  hardwareReportBytes,
  verifyTeeQuote,
  generateSigningKeypair,
  generateBoxKeypair,
  sign,
  toBase58,
} from "../dist/index.js";

const identity = { agentId: "dark-analyst-01", model: "phala/deepseek-r1-70b-tee", policy: "sealed" };
// A stand-in for raw SGX/TDX/SNP evidence and its launch measurement (48-byte MRTD-style hex).
const rawQuote = new TextEncoder().encode("TDX-v4-quote-bytes-" + "ab".repeat(64));
const MRTD = "9f".repeat(48);

function hardwareQuote({ measurement = MRTD, raw = rawQuote, timestamp = Math.floor(Date.now() / 1000), signWith } = {}) {
  const signing = generateSigningKeypair();
  const enc = generateBoxKeypair();
  const signingPublicKey = toBase58(signing.publicKey);
  const encryptionPublicKey = toBase58(enc.publicKey);
  const bytes = hardwareReportBytes({ measurement, signingPublicKey, encryptionPublicKey, timestamp, identity, rawQuote: raw });
  const signature = toBase58(sign(bytes, (signWith ?? signing).secretKey));
  return importHardwareQuote({
    provider: "dstack", identity, rawQuote: raw, measurement, signingPublicKey, encryptionPublicKey, signature, timestamp,
  });
}

test("local-dev quotes still verify (unchanged v1 report format)", () => {
  const { quote } = generateTeeQuote(identity);
  assert.equal(quote.evidenceDigest, undefined);
  const v = verifyTeeQuote(quote, { allowedProviders: ["local-dev"], maxAgeSeconds: 60 });
  assert.deepEqual(v, { valid: true, reasons: [] });
});

test("genuine hardware quote with an allowed measurement verifies", () => {
  const q = hardwareQuote();
  assert.equal(q.measurement, MRTD);
  assert.match(q.evidenceDigest, /^[0-9a-f]{64}$/);
  const v = verifyTeeQuote(q, { allowedMeasurements: [MRTD], allowedProviders: ["dstack"], maxAgeSeconds: 60, rawQuote });
  assert.deepEqual(v, { valid: true, reasons: [] });
  // allow-list match is case-insensitive
  assert.equal(verifyTeeQuote(q, { allowedMeasurements: [MRTD.toUpperCase()] }).valid, true);
});

test("hardware quote with an unknown measurement fails closed", () => {
  const v = verifyTeeQuote(hardwareQuote(), { allowedMeasurements: ["00".repeat(48)] });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("measurement is not in the allow-list"));
});

test("hardware quote without an allow-list fails closed", () => {
  for (const opts of [{}, { allowedMeasurements: [] }]) {
    const v = verifyTeeQuote(hardwareQuote(), opts);
    assert.equal(v.valid, false);
    assert.ok(v.reasons.includes("hardware quotes require an allowedMeasurements allow-list"));
  }
});

test("malformed measurement fails", () => {
  const v = verifyTeeQuote(hardwareQuote({ measurement: "not-hex!" }), { allowedMeasurements: ["not-hex!"] });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("measurement is not a hex string"));
});

test("tampered measurement or evidence breaks the signature", () => {
  const q = hardwareQuote();
  const other = "11".repeat(48);
  const v1 = verifyTeeQuote({ ...q, measurement: other }, { allowedMeasurements: [other] });
  assert.equal(v1.valid, false);
  assert.ok(v1.reasons.includes("report signature is invalid"));
  const v2 = verifyTeeQuote({ ...q, evidenceDigest: "22".repeat(32) }, { allowedMeasurements: [MRTD] });
  assert.equal(v2.valid, false);
  assert.ok(v2.reasons.includes("report signature is invalid"));
});

test("raw evidence that doesn't match the digest is rejected", () => {
  const v = verifyTeeQuote(hardwareQuote(), { allowedMeasurements: [MRTD], rawQuote: new Uint8Array([1, 2, 3]) });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("raw hardware evidence does not match the quote's evidence digest"));
});

test("signature from a different key is rejected", () => {
  const v = verifyTeeQuote(hardwareQuote({ signWith: generateSigningKeypair() }), { allowedMeasurements: [MRTD] });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("report signature is invalid"));
});

test("software quote labeled as hardware is rejected (no evidence)", () => {
  const { quote } = generateTeeQuote(identity, "sgx");
  const v = verifyTeeQuote(quote, { allowedMeasurements: [quote.measurement] });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("hardware quote carries no hardware evidence digest"));
});

test("local-dev quote carrying hardware evidence is rejected", () => {
  const { quote } = generateTeeQuote(identity);
  const v = verifyTeeQuote({ ...quote, evidenceDigest: "33".repeat(32) });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes("local-dev quote must not carry hardware evidence"));
});

test("stale and future-dated hardware quotes fail", () => {
  const now = Math.floor(Date.now() / 1000);
  const stale = verifyTeeQuote(hardwareQuote({ timestamp: now - 7200 }), { allowedMeasurements: [MRTD], maxAgeSeconds: 3600 });
  assert.equal(stale.valid, false);
  const future = verifyTeeQuote(hardwareQuote({ timestamp: now + 7200 }), { allowedMeasurements: [MRTD], maxAgeSeconds: 3600 });
  assert.equal(future.valid, false);
  assert.ok(future.reasons.includes("quote timestamp is in the future"));
});

test("importHardwareQuote refuses local-dev", () => {
  assert.throws(() => importHardwareQuote({ provider: "local-dev", identity, rawQuote, measurement: MRTD, signingPublicKey: "x", encryptionPublicKey: "y", signature: "z", timestamp: 0 }));
});

test("garbage signature encoding fails closed instead of throwing", () => {
  const q = hardwareQuote();
  const v = verifyTeeQuote({ ...q, signature: "0OIl" }, { allowedMeasurements: [MRTD] });
  assert.equal(v.valid, false);
});
