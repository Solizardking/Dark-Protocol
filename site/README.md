# protocol.darkx402.com

Static pages for Dark Protocol, served by the Cloudflare Worker `dark-protocol-page`:

| URL | File |
|---|---|
| `protocol.darkx402.com/` · `darkx402.com/dark-protocol` | `public/index.html` |
| `/article` · `/dark-protocol/article` | `public/article/index.html` |
| `/solana-foundation` (alias `/verification`), with or without `/dark-protocol` | `public/solana-foundation/index.html` |

`worker.js` strips a leading `/dark-protocol`, so both hosts serve the same pages. `public/index.html`
and `public/article/index.html` mirror what was live on 2026-11-19, with Cloudflare's edge-injected
scripts removed. Cloudflare adds those back at the edge.

## Check and preview

```bash
cd site
npm run check                 # lint (tags, meta, local links, secrets) + node:test
node scripts/serve.mjs 8787   # preview worker.js locally → http://localhost:8787/solana-foundation
```

The OG card (`public/og/solana-foundation.png`, 1200×630) is a screenshot of
`og-src/solana-foundation.html` taken in headless Chrome at that viewport.

## Deploying (manual, not automatic)

Merging does **not** deploy. No CI job publishes this Worker. The live Worker was uploaded by hand
to the Cloudflare account that owns `darkx402.com`. That account has the route
`darkx402.com/dark-protocol*` and the custom domain `protocol.darkx402.com` → `dark-protocol-page`.
`wrangler.toml` deliberately declares neither, so a deploy only replaces the script and assets.

With the account owner's go-ahead:

```bash
cd site && npx wrangler deploy
```

Afterwards, check that `https://protocol.darkx402.com/solana-foundation` and
`https://darkx402.com/dark-protocol/solana-foundation` return 200.

## Also in this folder (from main's rewrite commit)

The flat files at this level — `index.html`, `article.html`, `article.md`,
`article-hero.webp`, `build_worker.py`, `deploy-baseline.txt` — are the
bundle-era copies of the same pages that came in with the November 2026
rewrite on main. The page content lives on in `public/` (with the PR's nav,
@solanafdn card, and mobile-header edits on top); the hero image is
byte-identical in both places. The deployable Worker is the `worker.js`
above, serving `public/` via the ASSETS binding — `build_worker.py` built
the previous embedded bundle and is kept for reference, along with its
deployment log.
