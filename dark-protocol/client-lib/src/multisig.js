// Multisig approvals — REAL Ed25519 signatures, fixing H-8.
//
// THE OLD BUG: approve(proposalId, signerPubkey: string) checked only that
// the STRING appeared in owners[] — anyone who knew the (public) owner
// pubkeys could "approve" as every owner. No signature was ever requested.
//
// HERE: an approval is an Ed25519 signature over the exact canonical payload
// bytes, verified with @noble/curves against the owner's public key. String
// equality plays no role. A signature over any other payload, by any other
// key, or replayed from another proposal, fails verification (tested).

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { bytesToHex, concatBytes, hexToBytes } from './field.js';

const DOMAIN = new TextEncoder().encode('DarkMultisig/v1');

/**
 * Canonical proposal digest. Owners sign
 *   SHA-256("DarkMultisig/v1" || proposalId || 0x00 || action || 0x00 || SHA-256(payload))
 * so a signature is bound to this proposal, this action, and this payload —
 * it cannot be replayed onto a different transfer.
 */
export function proposalDigest({ proposalId, action, payload }) {
  const enc = new TextEncoder();
  const payloadHash = sha256(payload instanceof Uint8Array ? payload : enc.encode(String(payload)));
  return sha256(
    concatBytes(
      DOMAIN,
      enc.encode(String(proposalId)),
      new Uint8Array([0]),
      enc.encode(String(action)),
      new Uint8Array([0]),
      payloadHash,
    ),
  );
}

/** An owner approves by signing the proposal digest with their Ed25519 key. */
export function signApproval(ownerSecretKey, proposal) {
  const digest = proposalDigest(proposal);
  return {
    publicKey: ed25519.getPublicKey(ownerSecretKey),
    signature: ed25519.sign(digest, ownerSecretKey),
  };
}

/**
 * Verify a set of approvals against the owner set and threshold.
 * `owners` is an array of Ed25519 public keys (Uint8Array(32) or hex string).
 * Returns { ok, validCount, validOwners } — ok iff at least `threshold`
 * DISTINCT owners produced valid signatures over this exact proposal.
 */
export function verifyApprovals(proposal, approvals, owners, threshold) {
  const digest = proposalDigest(proposal);
  const ownerSet = new Set(
    owners.map((o) => (typeof o === 'string' ? o.toLowerCase() : bytesToHex(o))),
  );
  const validOwners = new Set();
  for (const approval of approvals ?? []) {
    try {
      const pkBytes =
        typeof approval.publicKey === 'string' ? hexToBytes(approval.publicKey) : approval.publicKey;
      const pkHex = bytesToHex(pkBytes);
      if (!ownerSet.has(pkHex)) continue; // not an owner — signature irrelevant
      if (validOwners.has(pkHex)) continue; // duplicate — count once
      const sigBytes =
        typeof approval.signature === 'string' ? hexToBytes(approval.signature) : approval.signature;
      if (ed25519.verify(sigBytes, digest, pkBytes)) validOwners.add(pkHex);
    } catch {
      // malformed signature/key — not a valid approval, keep counting others
    }
  }
  return {
    ok: validOwners.size >= threshold,
    validCount: validOwners.size,
    validOwners: [...validOwners],
  };
}
