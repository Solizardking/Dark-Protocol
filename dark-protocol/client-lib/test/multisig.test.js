// Multisig approvals: real Ed25519 signatures only (H-8).
// The old code accepted a pubkey STRING; every test here would have failed it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { signApproval, verifyApprovals } from '../src/index.js';

function makeOwner() {
  const sk = new Uint8Array(32);
  globalThis.crypto.getRandomValues(sk);
  return { sk, pk: ed25519.getPublicKey(sk) };
}
const o1 = makeOwner();
const o2 = makeOwner();
const o3 = makeOwner();
const outsider = makeOwner();
const OWNER_PKS = [o1.pk, o2.pk, o3.pk];

const proposal = { proposalId: 'prop-1', action: 'transfer', payload: 'send 50 to alice' };

test('real signatures from 2 of 3 owners meet threshold', () => {
  const approvals = [signApproval(o1.sk, proposal), signApproval(o2.sk, proposal)];
  const res = verifyApprovals(proposal, approvals, OWNER_PKS, 2);
  assert.equal(res.ok, true);
  assert.equal(res.validCount, 2);
});

test('one signature is below threshold', () => {
  const res = verifyApprovals(proposal, [signApproval(o1.sk, proposal)], OWNER_PKS, 2);
  assert.equal(res.ok, false);
  assert.equal(res.validCount, 1);
});

test('FORGED approval: knowing the pubkey string is worth nothing (H-8)', () => {
  // The old attack: pass the owner's pubkey with a garbage "signature".
  const forged = {
    publicKey: o1.pk,
    signature: new Uint8Array(64).fill(0xab),
  };
  const res = verifyApprovals(proposal, [forged, signApproval(o2.sk, proposal)], OWNER_PKS, 2);
  assert.equal(res.validCount, 1); // only o2's real signature counts
  assert.equal(res.ok, false);
});

test('signature over a DIFFERENT payload does not approve this one', () => {
  const otherProposal = { proposalId: 'prop-1', action: 'transfer', payload: 'send 5000 to mallory' };
  const approvals = [signApproval(o1.sk, otherProposal), signApproval(o2.sk, otherProposal)];
  const res = verifyApprovals(proposal, approvals, OWNER_PKS, 2);
  assert.equal(res.validCount, 0);
  assert.equal(res.ok, false);
});

test('signature replayed from another proposal id does not count', () => {
  const other = { ...proposal, proposalId: 'prop-2' };
  const approvals = [signApproval(o1.sk, other), signApproval(o2.sk, proposal)];
  const res = verifyApprovals(proposal, approvals, OWNER_PKS, 2);
  assert.equal(res.validCount, 1);
  assert.equal(res.ok, false);
});

test('non-owner signatures are ignored', () => {
  const approvals = [signApproval(outsider.sk, proposal), signApproval(o1.sk, proposal)];
  const res = verifyApprovals(proposal, approvals, OWNER_PKS, 2);
  assert.equal(res.validCount, 1);
  assert.equal(res.ok, false);
});

test('duplicate approvals from one owner count once', () => {
  const approvals = [signApproval(o1.sk, proposal), signApproval(o1.sk, proposal)];
  const res = verifyApprovals(proposal, approvals, OWNER_PKS, 2);
  assert.equal(res.validCount, 1);
  assert.equal(res.ok, false);
});
