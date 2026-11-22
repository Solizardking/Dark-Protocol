// Pool indexer tail (INTEGRATIONS §3.1 / TRANSPLANT-SPEC W7).
//
// Pattern = the dark402 rings feed: poll getSignaturesForAddress on the
// pool program via Helius RPC, fetch each transaction, decode the
// program's events from its logs, apply them to the PoolTree in slot
// order. State (leaves, spent nullifiers, last processed signature) is
// persisted atomically after every batch so a restart resumes mid-stream.
//
// This is the ONLY indexer for pool state. Photon indexes Light trees and
// DAS indexes standard assets — neither sees this program's frontier.
//
// Env:
//   DARK_PROTOCOL_PROGRAM_ID  the merged program's ID (set at W5; until
//                             then the placeholder from Anchor.toml works
//                             for local/synthetic runs only)
//   HELIUS_RPC_URL            full RPC URL (preferred), or
//   HELIUS_API_KEY            to build the Helius RPC URL from
//   SOLANA_CLUSTER            devnet (default) | mainnet-beta
//   INDEXER_STATE_PATH        state file (default ./indexer-state.json)
//   INDEXER_POLL_MS           poll interval (default 5000)
//
// The RPC key is read from env, used only as transport, never logged.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { PoolTree } from './pool.js';
import { eventsFromLogs } from './events.js';

export function resolveRpcUrl(env = process.env) {
  if (env.HELIUS_RPC_URL) return env.HELIUS_RPC_URL;
  const cluster = env.SOLANA_CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet';
  if (env.HELIUS_API_KEY) return `https://${cluster}.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return cluster === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
}

export class Rpc {
  constructor(url) {
    this.url = url;
    this.id = 0;
  }

  async call(method, params) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
    return json.result;
  }

  signaturesForAddress(address, opts = {}) {
    return this.call('getSignaturesForAddress', [address, { limit: 1000, commitment: 'confirmed', ...opts }]);
  }

  transaction(signature) {
    return this.call('getTransaction', [
      signature,
      { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'json' },
    ]);
  }
}

export class PoolIndexer {
  constructor({ rpc, programId, statePath }) {
    this.rpc = rpc;
    this.programId = programId;
    this.statePath = statePath;
    this.tree = new PoolTree();
    this.lastSignature = null;
  }

  async load() {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      const json = JSON.parse(raw);
      this.tree = PoolTree.fromJSON(json.tree);
      this.lastSignature = json.lastSignature ?? null;
    } catch {
      // No state yet — start from the beginning of the program's history.
    }
  }

  async save() {
    const tmp = `${this.statePath}.tmp`;
    await writeFile(tmp, JSON.stringify({ tree: this.tree.toJSON(), lastSignature: this.lastSignature }));
    await rename(tmp, this.statePath);
  }

  /** One tail pass: fetch new signatures (oldest-first application), apply
   *  every event, persist. Returns the number of transactions processed. */
  async pollOnce() {
    const page = await this.rpc.signaturesForAddress(this.programId, {
      until: this.lastSignature ?? undefined,
    });
    const fresh = page.filter((s) => !s.err);
    // getSignaturesForAddress returns newest-first; apply oldest-first.
    for (const entry of [...fresh].reverse()) {
      const tx = await this.rpc.transaction(entry.signature);
      const logs = tx?.meta?.logMessages ?? [];
      for (const event of eventsFromLogs(logs, this.programId)) {
        await this.tree.apply(event);
      }
      this.lastSignature = entry.signature;
      await this.save();
    }
    return fresh.length;
  }

  async run(pollMs = 5000) {
    await this.load();
    for (;;) {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error(`[indexer] poll failed: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const programId = process.env.DARK_PROTOCOL_PROGRAM_ID;
  if (!programId) {
    console.error('DARK_PROTOCOL_PROGRAM_ID is not set (see W7 README — no default exists by design)');
    process.exit(1);
  }
  const indexer = new PoolIndexer({
    rpc: new Rpc(resolveRpcUrl()),
    programId,
    statePath: process.env.INDEXER_STATE_PATH ?? './indexer-state.json',
  });
  await indexer.run(Number(process.env.INDEXER_POLL_MS ?? 5000));
}
