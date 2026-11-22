/**
 * W6 smoke suite for the migrated SDK, run against the built dist with
 * node --test (the repo's jest setup never had a single test file and
 * its ESM/CJS interop cannot load @solana/web3.js's dependency chain;
 * every other suite in this project — client-lib, indexer, rail-worker —
 * uses node --test for the same reason).
 *
 * Covers the transplant's load-bearing behaviors without network:
 *  - no default program ID: construction fails closed when unconfigured
 *  - the bundled IDL is the merged program's (4 instructions, Pool +
 *    NullifierMarker accounts, 10 errors, codes 6000-6009)
 *  - PDA derivations match the program's seeds
 *  - instruction builders produce instructions against the configured ID
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Keypair } from '@solana/web3.js';
import { DarkProtocolClient } from '../dist/bundle.js';
import { DARK_PROTOCOL_IDL } from '../dist/idl/dark_protocol.js';

const PLACEHOLDER_ID = '2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL';
const programId = new PublicKey(PLACEHOLDER_ID);

test('construction throws when no program ID is configured anywhere', async () => {
  const saved = process.env.DARK_PROTOCOL_PROGRAM_ID;
  delete process.env.DARK_PROTOCOL_PROGRAM_ID;
  try {
    await assert.rejects(
      DarkProtocolClient.create({ rpcUrl: 'http://localhost:8899' }),
      /no default/i
    );
  } finally {
    if (saved !== undefined) process.env.DARK_PROTOCOL_PROGRAM_ID = saved;
  }
});

test('env-provided program ID is honored', async () => {
  const saved = process.env.DARK_PROTOCOL_PROGRAM_ID;
  process.env.DARK_PROTOCOL_PROGRAM_ID = PLACEHOLDER_ID;
  try {
    const client = await DarkProtocolClient.fromEnv({ rpcUrl: 'http://localhost:8899' });
    assert.equal(client.programId.toBase58(), PLACEHOLDER_ID);
  } finally {
    if (saved === undefined) delete process.env.DARK_PROTOCOL_PROGRAM_ID;
    else process.env.DARK_PROTOCOL_PROGRAM_ID = saved;
  }
});

test('bundled IDL is exactly the merged program surface', () => {
  assert.deepEqual(
    DARK_PROTOCOL_IDL.instructions.map((i) => i.name),
    ['initialize', 'deposit', 'withdraw', 'transfer']
  );
  assert.deepEqual(
    DARK_PROTOCOL_IDL.accounts.map((a) => a.name).sort(),
    ['NullifierMarker', 'Pool']
  );
  assert.equal(DARK_PROTOCOL_IDL.errors.length, 10);
  assert.equal(DARK_PROTOCOL_IDL.errors[0].code, 6000);
  assert.equal(DARK_PROTOCOL_IDL.errors[9].code, 6009);
  assert.ok(DARK_PROTOCOL_IDL.errors.map((e) => e.name).includes('TransferNotEnabled'));
});

test('PDA derivations match the program seeds', async () => {
  const client = await DarkProtocolClient.create({ programId, rpcUrl: 'http://localhost:8899' });
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool')], programId);
  assert.ok(client.poolAddress().equals(pool));
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), pool.toBuffer()],
    programId
  );
  assert.ok(client.vaultAddress().equals(vault));
  const a = DarkProtocolClient.nullifierMarkerAddress(programId, new Uint8Array(32).fill(1));
  const b = DarkProtocolClient.nullifierMarkerAddress(programId, new Uint8Array(32).fill(2));
  assert.ok(!a.equals(b));
});

test('shield() builds a deposit instruction against the configured program', async () => {
  const client = await DarkProtocolClient.create({ programId, rpcUrl: 'http://localhost:8899' });
  const depositor = Keypair.generate().publicKey;
  const ix = await client.shield(depositor, { amount: 500n, cm: new Uint8Array(32).fill(9) });
  assert.ok(ix.programId.equals(programId));
  assert.ok(ix.keys.some((k) => k.pubkey.equals(client.poolAddress())));
  assert.ok(ix.keys.some((k) => k.pubkey.equals(depositor)));
});

test('unshield() builds a withdraw instruction with marker + recipient accounts', async () => {
  const client = await DarkProtocolClient.create({ programId, rpcUrl: 'http://localhost:8899' });
  const recipient = Keypair.generate().publicKey;
  const feePayer = Keypair.generate().publicKey;
  const nf = new Uint8Array(32).fill(3);
  const ix = await client.unshield({
    proof: new Uint8Array(256),
    root: new Uint8Array(32),
    nf,
    amount: 500n,
    recipient,
    feePayer,
  });
  assert.ok(ix.programId.equals(programId));
  const marker = DarkProtocolClient.nullifierMarkerAddress(programId, nf);
  assert.ok(ix.keys.some((k) => k.pubkey.equals(marker)));
  assert.ok(ix.keys.some((k) => k.pubkey.equals(recipient)));
});

test('unshield() rejects a malformed proof instead of building garbage', async () => {
  const client = await DarkProtocolClient.create({ programId, rpcUrl: 'http://localhost:8899' });
  await assert.rejects(
    client.unshield({
      proof: new Uint8Array(10),
      root: new Uint8Array(32),
      nf: new Uint8Array(32),
      amount: 1n,
      recipient: Keypair.generate().publicKey,
      feePayer: Keypair.generate().publicKey,
    }),
    /256 bytes/
  );
});
