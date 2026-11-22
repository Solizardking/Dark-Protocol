// Indexer read API for clients (TRANSPLANT-SPEC W7).
//
//   GET /health            → { ok, leaves, spent, root }
//   GET /root              → { root } — rebuilt off-chain root; clients
//                            compare it against Pool.current_root on-chain
//   GET /path/:leafIndex   → { pathElements, pathIndices, root } for proving
//   GET /spent/:nfHex      → { spent } — from NoteWithdrawn events
//
// All values are decimal strings for field elements (JSON-safe), hex for
// raw byte lookups. Read-only; holds no keys.

import { createServer } from 'node:http';
import { PoolTree } from './pool.js';
import { PoolIndexer, Rpc, resolveRpcUrl } from './indexer.js';

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
await indexer.load();
indexer.run(Number(process.env.INDEXER_POLL_MS ?? 5000)).catch(() => {});

const port = Number(process.env.INDEXER_PORT ?? 8790);
createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      return send(200, {
        ok: true,
        leaves: indexer.tree.leaves.length,
        spent: indexer.tree.spentNullifiers.size,
        root: (await indexer.tree.currentRoot()).toString(),
      });
    }
    if (url.pathname === '/root') {
      return send(200, { root: (await indexer.tree.currentRoot()).toString() });
    }
    const pathMatch = url.pathname.match(/^\/path\/(\d+)$/);
    if (pathMatch) {
      const path = await indexer.tree.pathFor(Number(pathMatch[1]));
      return send(200, {
        pathElements: path.pathElements.map((x) => x.toString()),
        pathIndices: path.pathIndices,
        root: path.root.toString(),
      });
    }
    const spentMatch = url.pathname.match(/^\/spent\/([0-9a-fA-F]{64})$/);
    if (spentMatch) {
      return send(200, { spent: indexer.tree.isSpent(Buffer.from(spentMatch[1], 'hex')) });
    }
    return send(404, { error: 'not found' });
  } catch (err) {
    return send(400, { error: err.message });
  }
}).listen(port, () => console.log(`[indexer] serving on :${port}`));
