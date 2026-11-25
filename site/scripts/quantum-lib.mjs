// Shared loader, validator and renderer for the quantum-defense research feed.
// Data lives in ../../research/quantum/*.json; the page is public/quantum/index.html.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = join(siteRoot, "..", "research", "quantum");
export const pagePath = join(siteRoot, "public", "quantum", "index.html");
export const REPO = "https://github.com/Solizardking/Dark-Protocol";

export const LABELS = ["established", "likely", "speculative", "open"];
export const MATURITY = ["deployed", "merged", "prototype", "proposal", "paused", "research", "none"];
// Hosts accepted as primary sources (standards bodies, protocol teams, their repos, papers).
export const PRIMARY_HOSTS = [
  "csrc.nist.gov", "nvlpubs.nist.gov", "doi.org", "github.com", "eprint.iacr.org", "arxiv.org",
  "www.anza.xyz", "solana.com", "www.bip361.org", "bips.dev", "eips.ethereum.org", "ethresear.ch",
  "zips.z.cash", "z.cash", "clawdcompute.us", "groups.google.com", "lists.linuxfoundation.org",
  "datatracker.ietf.org", "www.rfc-editor.org", "blog.ethereum.org", "jumpcrypto.com",
];

export function loadData(dir = dataDir) {
  const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  return { entries: read("entries.json"), claims: read("claims.json") };
}

function checkSources(where, sources, errors) {
  if (!Array.isArray(sources) || sources.length === 0) { errors.push(`${where}: needs at least one source`); return; }
  for (const s of sources) {
    if (!s || typeof s.title !== "string" || !s.title.trim()) errors.push(`${where}: source without title`);
    let u;
    try { u = new URL(s.url); } catch { errors.push(`${where}: bad source url ${s && s.url}`); continue; }
    if (u.protocol !== "https:") errors.push(`${where}: source must be https (${s.url})`);
    if (!PRIMARY_HOSTS.includes(u.hostname)) errors.push(`${where}: ${u.hostname} is not on the primary-source host list`);
  }
}

export function validate({ entries, claims }) {
  const errors = [];
  if (entries.schema !== "darkx402.quantum-entries/v1") errors.push("entries.json: wrong schema");
  if (claims.schema !== "darkx402.quantum-claims/v1") errors.push("claims.json: wrong schema");
  const ids = new Set();
  for (const e of entries.entries || []) {
    const w = `entry ${e.id}`;
    if (!/^c\d{2}-f\d{2}$/.test(e.id || "")) errors.push(`${w}: id must look like c01-f01`);
    if (ids.has(e.id)) errors.push(`${w}: duplicate id`);
    ids.add(e.id);
    if (!Number.isInteger(e.cycle) || e.cycle < 1) errors.push(`${w}: cycle must be a positive integer`);
    if (!Number.isInteger(e.worklist_item) || e.worklist_item < 1 || e.worklist_item > 9) errors.push(`${w}: worklist_item must be 1-9`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) errors.push(`${w}: date must be YYYY-MM-DD`);
    for (const k of ["title", "threat", "defense", "note"]) if (typeof e[k] !== "string" || !e[k].trim()) errors.push(`${w}: missing ${k}`);
    if (!LABELS.includes(e.label)) errors.push(`${w}: label must be one of ${LABELS.join("/")}`);
    if (!MATURITY.includes(e.maturity)) errors.push(`${w}: maturity must be one of ${MATURITY.join("/")}`);
    for (const k of ["primitives", "stack_components"]) if (!Array.isArray(e[k]) || !e[k].length) errors.push(`${w}: ${k} must be a non-empty array`);
    checkSources(w, e.sources, errors);
  }
  const cids = (claims.claims || []).map((c) => c.id);
  if (cids.join(",") !== "C1,C2,C3,C4,C5,C6,C7,C8") errors.push("claims.json: must list C1..C8 in order");
  for (const c of claims.claims || []) {
    if (!LABELS.includes(c.label)) errors.push(`claim ${c.id}: bad label`);
    if (typeof c.claim !== "string" || !c.claim.trim()) errors.push(`claim ${c.id}: missing text`);
    checkSources(`claim ${c.id}`, c.sources, errors);
  }
  return errors;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pill = (cls, text) => `<span class="pill ${esc(cls)}">${esc(text)}</span>`;
const srcList = (sources) => sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>`).join(" · ");

export function render({ entries, claims }) {
  // newest date first; within a date, in finding order
  const list = [...entries.entries].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const counts = Object.fromEntries(LABELS.map((l) => [l, list.filter((e) => e.label === l).length]));
  const feed = list.map((e) => `
<article class="card entry" id="${esc(e.id)}">
  <div class="meta"><span class="mono">${esc(e.id)}</span> · ${esc(e.date)} · cycle ${e.cycle} · worklist #${e.worklist_item} ${pill(e.label, e.label)} ${pill("mat", e.maturity)}</div>
  <h3>${esc(e.title)}</h3>
  <p><b>Threat.</b> ${esc(e.threat)}</p>
  <p><b>Defense.</b> ${esc(e.defense)}</p>
  <p class="small"><b>Primitives:</b> ${e.primitives.map(esc).join(", ")} · <b>Affects:</b> ${e.stack_components.map(esc).join(", ")}</p>
  <p class="small"><b>Sources:</b> ${srcList(e.sources)} · <a href="${REPO}/blob/main/${esc(e.note)}" rel="noopener">cycle note</a></p>
</article>`).join("");
  const cl = claims.claims.map((c) => `
<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.claim)}</td><td>${pill(c.label, c.label)}<div class="small">brief: ${esc(c.brief_label)}</div></td><td>${esc(c.challenge_status)}</td></tr>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quantum defense research feed — Dark Protocol</title>
<meta name="description" content="A sourced, recurring research feed on post-quantum and P = NP threats to Solana, Bitcoin, Ethereum and the Dark Protocol stack: findings with honest labels, and the claims under challenge.">
<link rel="canonical" href="https://protocol.darkx402.com/quantum">
<meta name="theme-color" content="#05060a">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Dark Protocol">
<meta property="og:title" content="Quantum defense research feed — Dark Protocol">
<meta property="og:description" content="Sourced post-quantum findings for Solana and the Dark Protocol stack, labelled established / likely / speculative / open. Research-only.">
<meta property="og:url" content="https://protocol.darkx402.com/quantum">
<style>
:root{--bg:#05060a;--card:#0d1019;--line:#1c2130;--text:#e8eaf2;--muted:#9aa3b8;--faint:#6b7390;--purple:#9945FF;--green:#14F195;--amber:#ffb454;--red:#ff6b7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:28px 18px 80px}a{color:var(--green)}
nav{display:flex;gap:18px;flex-wrap:wrap;font-size:.92rem;margin-bottom:28px}nav a{color:var(--muted);text-decoration:none}nav a:hover{color:var(--text)}
h1{font-size:2.2rem;line-height:1.15;margin:.2em 0}h2{margin:2.2em 0 .6em;font-size:1.45rem}h3{margin:.3em 0;font-size:1.08rem}
p{color:var(--muted);margin:.4em 0}.small{font-size:.85rem;color:var(--faint)}.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.28em;font-size:.72rem;color:var(--green);text-transform:uppercase}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:12px 0}
.meta{font-size:.82rem;color:var(--faint)}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 9px;font-size:.72rem;margin-left:4px;color:var(--text)}
.pill.established{border-color:var(--green);color:var(--green)}.pill.likely{border-color:var(--purple);color:#c9a6ff}
.pill.speculative{border-color:var(--amber);color:var(--amber)}.pill.open{border-color:var(--faint);color:var(--muted)}
.pill.sev-critical{border-color:var(--red);color:var(--red)}.pill.sev-high{border-color:var(--amber);color:var(--amber)}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left;vertical-align:top}th{color:var(--faint);font-weight:500}
.note{border-left:3px solid var(--amber);padding:8px 14px;background:rgba(255,180,84,.05);border-radius:6px}
</style>
</head>
<body>
<main>
<nav><a href="/dark-protocol">Dark Protocol</a><a href="/dark-protocol/article">Article</a><a href="/dark-protocol/solana-foundation">Solana Foundation request</a><a href="/dark-protocol/quantum">Quantum defense</a></nav>
<div class="eyebrow">Research · post-quantum · updated ${esc(entries.updated)}</div>
<h1>Quantum defense research feed</h1>
<p>A recurring, sourced loop on what quantum computers (and, as a stress test, P = NP) would break in Solana, Bitcoin, Ethereum and our own stack, and what defends against it. Each cycle takes one item from the worklist, cites primary sources only, and labels every claim <span class="pill established">established</span><span class="pill likely">likely</span><span class="pill speculative">speculative</span><span class="pill open">open</span>.</p>
<p class="note small">Research-only and unreviewed: not an audit, not a publication, not advice to move funds. Worklist and method: <a href="${REPO}/blob/main/research/quantum/LOOP.md" rel="noopener">LOOP.md</a>. Companion brief: <a href="https://clawdcompute.us/research" rel="noopener">What If P = NP? (clawdcompute.us/research)</a>.</p>
<p class="small">${list.length} findings · ${LABELS.map((l) => `${counts[l]} ${l}`).join(" · ")} · 8 claims under challenge</p>

<h2 id="feed">Findings feed</h2>${feed}

<h2 id="claims">Claims under challenge (C1–C8)</h2>
<p class="small">${esc(claims.label_mapping)}.</p>
<div class="table"><table>
<thead><tr><th>ID</th><th>Claim</th><th>Label</th><th>Challenge</th></tr></thead>
<tbody>${cl}
</tbody></table></div>
</main>
</body>
</html>
`;
}
