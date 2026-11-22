// Anchor event decoding for the merged Dark Protocol program.
//
// Events are emitted via sol_log_data and appear in transaction logs as
// "Program data: <base64>". Payload = 8-byte discriminator
// (sha256("event:<Name>")[..8]) ‖ borsh-encoded fields, in field order.
//
//   ProtocolInitialized { authority: Pubkey, initial_root: [u8;32], vk_is_placeholder: bool }
//   NoteDeposited       { cm: [u8;32], leaf: [u8;32], leaf_index: u64, new_root: [u8;32] }
//   NoteWithdrawn       { nf: [u8;32], amount: u64, recipient: Pubkey }
//
// The `leaf` field of NoteDeposited is the deposit-bound leaf
// Poseidon(cm, amount) the program inserted — indexers insert exactly
// this value, never a locally recomputed raw commitment (NEW-1).

import { createHash } from 'node:crypto';

export function eventDiscriminator(name) {
  return createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);
}

export const EVENTS = {
  ProtocolInitialized: { name: 'ProtocolInitialized', size: 8 + 32 + 32 + 1 },
  NoteDeposited: { name: 'NoteDeposited', size: 8 + 32 + 32 + 8 + 32 },
  NoteWithdrawn: { name: 'NoteWithdrawn', size: 8 + 32 + 8 + 32 },
};

const DISCRIMINATORS = new Map(
  Object.values(EVENTS).map((e) => [eventDiscriminator(e.name).toString('hex'), e.name])
);

function u64le(buf, offset) {
  return buf.readBigUInt64LE(offset);
}

/** Decode one base64 "Program data:" payload. Returns null for foreign data. */
export function decodeEvent(base64) {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 8) return null;
  const name = DISCRIMINATORS.get(buf.subarray(0, 8).toString('hex'));
  if (!name) return null;
  if (buf.length !== EVENTS[name].size) {
    throw new Error(`decodeEvent: ${name} payload is ${buf.length} bytes, expected ${EVENTS[name].size}`);
  }
  switch (name) {
    case 'ProtocolInitialized':
      return {
        type: name,
        authority: buf.subarray(8, 40),
        initialRoot: buf.subarray(40, 72),
        vkIsPlaceholder: buf[72] !== 0,
      };
    case 'NoteDeposited':
      return {
        type: name,
        cm: buf.subarray(8, 40),
        leaf: buf.subarray(40, 72),
        leafIndex: u64le(buf, 72),
        newRoot: buf.subarray(80, 112),
      };
    case 'NoteWithdrawn':
      return {
        type: name,
        nf: buf.subarray(8, 40),
        amount: u64le(buf, 40),
        recipient: buf.subarray(48, 80),
      };
    default:
      return null;
  }
}

/** Extract this program's events from a transaction's log messages, in order. */
export function eventsFromLogs(logMessages, programId) {
  const events = [];
  let inProgram = false;
  for (const line of logMessages ?? []) {
    if (line.startsWith(`Program ${programId} invoke`)) inProgram = true;
    else if (line.startsWith(`Program ${programId} success`) || line.startsWith(`Program ${programId} failed`)) inProgram = false;
    else if (inProgram && line.startsWith('Program data: ')) {
      const decoded = decodeEvent(line.slice('Program data: '.length));
      if (decoded) events.push(decoded);
    }
  }
  return events;
}

/** Encode an event payload (used by tests to synthesize program-faithful logs). */
export function encodeEvent(name, fields) {
  const disc = eventDiscriminator(name);
  const body = Buffer.alloc(EVENTS[name].size - 8);
  if (name === 'ProtocolInitialized') {
    Buffer.from(fields.authority).copy(body, 0);
    Buffer.from(fields.initialRoot).copy(body, 32);
    body[64] = fields.vkIsPlaceholder ? 1 : 0;
  } else if (name === 'NoteDeposited') {
    Buffer.from(fields.cm).copy(body, 0);
    Buffer.from(fields.leaf).copy(body, 32);
    body.writeBigUInt64LE(BigInt(fields.leafIndex), 64);
    Buffer.from(fields.newRoot).copy(body, 72);
  } else if (name === 'NoteWithdrawn') {
    Buffer.from(fields.nf).copy(body, 0);
    body.writeBigUInt64LE(BigInt(fields.amount), 32);
    Buffer.from(fields.recipient).copy(body, 40);
  } else {
    throw new Error(`encodeEvent: unknown event ${name}`);
  }
  return Buffer.concat([disc, body]).toString('base64');
}
