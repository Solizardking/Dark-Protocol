# protocol.darkx402.com — site source

The public explainer for Dark Protocol, served by the `dark-protocol-page`
Cloudflare Worker at:

- https://protocol.darkx402.com/
- https://darkx402.com/dark-protocol (same worker, path-normalised)

| File | What it is |
|---|---|
| `index.html` | The explainer: "Dark Protocol — Private transfers on Solana, with the math checked." Status is labelled honestly on the page (devnet live, mainnet not launched, verification in progress). |
| `article.html` | The long-form article page, served at `/dark-protocol/article`. |
| `article.md` | The article source: "Dark Protocol: A Year of Building Private Solana — and the Proof We Ran Out of Fuel to Finish" (published 2026-11-19). |
| `article-hero.webp` | The article's hero art (also embedded in the worker bundle). |
| `build_worker.py` | Builds `worker.js` from the two HTML pages + hero image. |
| `worker.js` | The built worker bundle that is actually deployed. |
| `deploy-baseline.txt` | The deployment log: pre/post probes proving the surrounding darkx402.com app was untouched by the page deploys. |
