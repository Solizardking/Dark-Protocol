// W7 local verification (stands in for the W5-gated on-chain check).
//
// A scripted deposit sequence is built with @dark-protocol/client-lib —
// the same code clients use: notes are created, bound leaves computed,
// and the reference root taken from client-lib's Poseidon tree. The
// deposits are then replayed through the indexer's event pipeline as
// program-faithful log lines (Anchor "Program data:" payloads encoded
// by src/events.js from the same values the program would emit). The
// indexer's rebuilt root must equal the reference root after EVERY
// deposit, a Merkle path served by the indexer must verify, and a
// withdraw event must flip the spent-nullifier lookup.
//
// The on-chain half of the W7 gate — indexer root == Pool.current_root
// read from a live pool after a scripted on-chain deposit sequence —
// runs in W5 (devnet rehearsal, held for the dev's go), because there
// is no deployed pool until then.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountKeys,
  Note,
  computeRoot,
  emptyRoot,
  fieldToBytes,
} from '@dark-protocol/client-lib';
import { PoolTree } from '../src/pool.js';
import { encodeEvent, eventsFromLogs } from '../src/events.js';

const PROGRAM_ID = '2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL';
const AUTHORITY = new Uint8Array(32).fill(7);

function logsFor(...payloads) {
  return [
    `Program ${PROGRAM_ID} invoke [1]`,
    ...payloads.map((p) => `Program data: ${p}`),
    `Program ${PROGRAM_ID} success`,
  ];
}

test('indexer rebuilds the exact tree from a scripted deposit sequence', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(42), 0);
  const tree = new PoolTree();

  // initialize
  const initRoot = await emptyRoot();
  const initLogs = logsFor(encodeEvent('ProtocolInitialized', {
    authority: AUTHORITY,
    initialRoot: fieldToBytes(initRoot),
    vkIsPlaceholder: false,
  }));
  for (const ev of eventsFromLogs(initLogs, PROGRAM_ID)) await tree.apply(ev);
  assert.equal(await tree.currentRoot(), initRoot);

  // five deposits of varying amounts
  const leaves = [];
  const amounts = [500n, 1n, 1_000_000n, 42n, 999_999n];
  for (let i = 0; i < amounts.length; i++) {
    const note = Note.create(keys.ownerId, amounts[i]);
    const cm = await note.commitment();
    const leaf = await note.boundLeaf();
    leaves.push(leaf);
    const referenceRoot = await computeRoot(leaves);
    const depositLogs = logsFor(encodeEvent('NoteDeposited', {
      cm: fieldToBytes(cm),
      leaf: fieldToBytes(leaf),
      leafIndex: i,
      newRoot: fieldToBytes(referenceRoot),
    }));
    const events = eventsFromLogs(depositLogs, PROGRAM_ID);
    assert.equal(events.length, 1);
    await tree.apply(events[0]);
    assert.equal(await tree.currentRoot(), referenceRoot, `root mismatch after deposit ${i}`);
    assert.equal(tree.leaves.length, i + 1);
  }

  // a path served by the indexer verifies against the rebuilt root
  assert.equal(await tree.verifyPath(2), true);
  const path = await tree.pathFor(4);
  assert.equal(path.root, await tree.currentRoot());

  // withdraw event flips the spent lookup
  const note0 = Note.create(keys.ownerId, amounts[0]);
  note0.leafIndex = 0;
  const nf = await note0.nullifier(keys.nk);
  const nfBytes = fieldToBytes(nf);
  assert.equal(tree.isSpent(nfBytes), false);
  const withdrawLogs = logsFor(encodeEvent('NoteWithdrawn', {
    nf: nfBytes,
    amount: amounts[0],
    recipient: AUTHORITY,
  }));
  for (const ev of eventsFromLogs(withdrawLogs, PROGRAM_ID)) await tree.apply(ev);
  assert.equal(tree.isSpent(nfBytes), true);
});

test('indexer fails closed on a root that does not match its rebuild', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(1), 0);
  const tree = new PoolTree();
  const initRoot = await emptyRoot();
  for (const ev of eventsFromLogs(logsFor(encodeEvent('ProtocolInitialized', {
    authority: AUTHORITY, initialRoot: fieldToBytes(initRoot), vkIsPlaceholder: false,
  })), PROGRAM_ID)) await tree.apply(ev);

  const note = Note.create(keys.ownerId, 5n);
  const badLogs = logsFor(encodeEvent('NoteDeposited', {
    cm: fieldToBytes(await note.commitment()),
    leaf: fieldToBytes(await note.boundLeaf()),
    leafIndex: 0,
    newRoot: fieldToBytes(12345n), // not the root of this leaf
  }));
  await assert.rejects(async () => {
    for (const ev of eventsFromLogs(badLogs, PROGRAM_ID)) await tree.apply(ev);
  }, /rebuilt root != event newRoot/);
});

test('indexer rejects out-of-order deposits (missed event detection)', async () => {
  const keys = await deriveAccountKeys(new Uint8Array(32).fill(2), 0);
  const tree = new PoolTree();
  const initRoot = await emptyRoot();
  for (const ev of eventsFromLogs(logsFor(encodeEvent('ProtocolInitialized', {
    authority: AUTHORITY, initialRoot: fieldToBytes(initRoot), vkIsPlaceholder: false,
  })), PROGRAM_ID)) await tree.apply(ev);

  const note = Note.create(keys.ownerId, 5n);
  const leaf = await note.boundLeaf();
  const root = await computeRoot([leaf]);
  const logs = logsFor(encodeEvent('NoteDeposited', {
    cm: fieldToBytes(await note.commitment()),
    leaf: fieldToBytes(leaf),
    leafIndex: 3, // gap: indices 0..2 never arrived
    newRoot: fieldToBytes(root),
  }));
  await assert.rejects(async () => {
    for (const ev of eventsFromLogs(logs, PROGRAM_ID)) await tree.apply(ev);
  }, /missed a deposit/);
});
