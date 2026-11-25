# research/quantum — quantum-defense research feed

Machine-readable research on post-quantum and "P = NP" threats to blockchains and to the Dark Protocol / Clawd stack. Research-only: nothing here is an audit, a publication or advice to move funds.

| File | What it is |
|---|---|
| `LOOP.md` | The recurring routine's instructions, ordered worklist and log. **Source of truth.** |
| `entries.json` | One object per sourced finding (`darkx402.quantum-entries/v1`). |
| `inventory.json` | Cryptographic primitives in our stack and their quantum exposure (`darkx402.quantum-inventory/v1`). |
| `claims.json` | Claims C1–C8 from *What If P = NP? A Blockchain Research Brief* (clawdcompute.us/research), with labels and challenge status. |
| `notes/` | One dated Markdown note per cycle. |

Labels: `established` · `likely` · `speculative` · `open`. Sources must be primary and must resolve.

The page at `site/public/quantum/index.html` (served at `/quantum` and `/research/quantum` on protocol.darkx402.com once deployed) is generated from these files:

```bash
node site/scripts/build-quantum.mjs          # regenerate the page
node site/scripts/check-quantum-sources.mjs  # verify every cited URL resolves (network)
cd site && npm run check                     # lint + tests (includes schema + in-sync checks)
```
