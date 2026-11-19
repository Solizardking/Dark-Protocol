# Pool indexer (TRANSPLANT-SPEC W7 · INTEGRATIONS W-3)

The pool's state — commitments appended, nullifiers spent, roots — is
emitted only by the merged program's events. Neither Photon (Light trees)
nor DAS (standard assets) indexes it, so the pool has exactly one
indexer: this one.

## What it does

- Tails the merged program via Helius RPC (`getSignaturesForAddress` +
  `getTransaction`, the rings-feed pattern), oldest-first.
- Decodes Anchor events from transaction logs (`src/events.js`):
  `ProtocolInitialized`, `NoteDeposited`, `NoteWithdrawn`.
- Rebuilds the depth-20 Poseidon tree off-chain from the **bound leaves**
  carried in `NoteDeposited` (`leaf = Poseidon(cm, amount)`, NEW-1) using
  `@dark-protocol/client-lib`'s tree — the same code clients prove
  against. Every deposit's rebuilt root is checked against the event's
  `newRoot`; a mismatch halts application (fail-closed) instead of
  serving paths from a tree the chain would reject.
- Tracks spent nullifiers from `NoteWithdrawn` events.
- Persists state atomically (`INDEXER_STATE_PATH`) and resumes mid-stream.
- Serves clients (`src/server.js`): `/root`, `/path/:leafIndex`,
  `/spent/:nfHex`, `/health`.

## Run

```
DARK_PROTOCOL_PROGRAM_ID=<id> HELIUS_API_KEY=<key> npm run tail   # tail only
DARK_PROTOCOL_PROGRAM_ID=<id> HELIUS_API_KEY=<key> npm start      # tail + API on :8790
npm test                                                          # local verification
```

There is no default program ID, by design: the merged program is not
deployed until W5, and its fresh ID lands in `DARK_PROTOCOL_PROGRAM_ID`,
the SDK config, `declare_id!`, and Anchor.toml in one change.

## Verification status

- **Local (done):** `npm test` replays a scripted deposit sequence built
  with client-lib through the event pipeline as program-faithful logs;
  the rebuilt root equals the reference root after every deposit, served
  paths verify, spent lookups flip on withdraw events, and corrupted /
  gapped streams are rejected.
- **On-chain (W5-gated):** the spec's W7 gate — indexer-rebuilt root ==
  `Pool.current_root` read from the live pool after a scripted on-chain
  deposit sequence — can only run once the program is deployed in the
  W5 devnet rehearsal, which is held for the dev's separate go.
