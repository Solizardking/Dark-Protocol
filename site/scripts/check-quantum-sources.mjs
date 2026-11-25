// Network check: every source URL in research/quantum/*.json and the cycle notes must resolve.
// Not part of `npm run check` (CI has no network guarantees). Run it each loop cycle.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadData, dataDir } from "./quantum-lib.mjs";

const { entries, inventory, claims } = loadData();
const urls = new Set();
for (const x of [...entries.entries, ...inventory.components, ...claims.claims]) for (const s of x.sources) urls.add(s.url);
for (const f of readdirSync(join(dataDir, "notes"))) {
  for (const m of readFileSync(join(dataDir, "notes", f), "utf8").matchAll(/https:\/\/[^\s)>\]]+/g)) urls.add(m[0].replace(/[.,;]+$/, ""));
}
let bad = 0;
for (const url of [...urls].sort()) {
  let status;
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (quantum-loop source check)" }, signal: AbortSignal.timeout(20000) });
    status = res.status;
  } catch (e) { status = "ERR " + e.message; }
  const ok = status === 200 || status === 429; // 429 = rate limited (solana.com); re-check by hand
  if (!ok) bad++;
  console.log(`${ok ? (status === 429 ? "~" : "✓") : "✗"} ${status} ${url}`);
}
console.log(bad ? `${bad} source(s) did not resolve` : `all ${urls.size} sources resolve (~ = rate limited, re-check by hand)`);
process.exit(bad ? 1 : 0);
