import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { resolvePath } from "../worker.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const read = (p) => readFileSync(join(pub, p), "utf8");
const sf = read("solana-foundation/index.html");
const text = sf.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("routes resolve on both hosts", () => {
  for (const p of ["/", "/dark-protocol", "/dark-protocol/"]) assert.equal(resolvePath(p).asset, "/index.html");
  for (const p of ["/article", "/dark-protocol/article", "/article/"]) assert.equal(resolvePath(p).asset, "/article/index.html");
  for (const p of ["/solana-foundation", "/dark-protocol/solana-foundation", "/verification", "/dark-protocol/verification/"])
    assert.equal(resolvePath(p).asset, "/solana-foundation/index.html");
  assert.equal(resolvePath("/dark-protocol/article-hero.webp").asset, "/article-hero.webp");
  assert.equal(resolvePath("/og/solana-foundation.png").asset, "/og/solana-foundation.png");
  assert.equal(resolvePath("/nope").status, 404);
  assert.equal(resolvePath("/dark-protocolx").status, 404);
});

test("worker serves assets and sets headers", async () => {
  const seen = [];
  const env = { ASSETS: { fetch: async (req) => { seen.push(new URL(req.url).pathname); return new Response("x", { headers: { "content-type": "text/html" } }); } } };
  const ok = await worker.fetch(new Request("https://protocol.darkx402.com/solana-foundation"), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "public, max-age=300");
  assert.equal(seen.at(-1), "/solana-foundation/index.html");
  const nf = await worker.fetch(new Request("https://darkx402.com/dark-protocol/missing"), env);
  assert.equal(nf.status, 404);
  const post = await worker.fetch(new Request("https://protocol.darkx402.com/", { method: "POST" }), env);
  assert.equal(post.status, 405);
});

test("Solana Foundation page has OG and Twitter meta", () => {
  for (const re of [
    /<link rel="canonical" href="https:\/\/protocol\.darkx402\.com\/solana-foundation">/,
    /<meta property="og:title" content="[^"]+">/,
    /<meta property="og:description" content="[^"]+">/,
    /<meta property="og:url" content="https:\/\/protocol\.darkx402\.com\/solana-foundation">/,
    /<meta property="og:image" content="https:\/\/protocol\.darkx402\.com\/og\/solana-foundation\.png">/,
    /<meta name="twitter:card" content="summary_large_image">/,
    /<meta name="twitter:image" content="https:\/\/protocol\.darkx402\.com\/og\/solana-foundation\.png">/,
  ]) assert.match(sf, re);
});

test("OG image exists and is 1200x630 PNG", () => {
  const buf = readFileSync(join(pub, "og/solana-foundation.png"));
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});

test("page covers every required section", () => {
  for (const id of ["built", "why", "scope", "ask", "returns", "integrations", "limits"]) assert.match(sf, new RegExp(`id="${id}"`));
  assert.match(sf, /href="https:\/\/x\.com\/solanafdn"/);
  assert.match(text, /Helius Privacy Rings/);
  assert.match(text, /@heliuslabs\/spr/);
  assert.match(text, /Crossmint/);
});

test("home and article link to the new page", () => {
  assert.match(read("index.html"), /<a href="\/dark-protocol\/solana-foundation" style="font-weight:600">Read the request/);
  assert.match(read("article/index.html"), /href="\/dark-protocol\/solana-foundation"/);
});

test("no unsupported claims on the new page", () => {
  const banned = [
    /\baudited by\b/i, /\bin partnership with\b/i, /\bpartnered with\b/i, /\bbacked by\b/i,
    /\bendorsed by\b/i, /\bfunded by the Solana Foundation\b/i, /\bgrant (?:from|awarded)\b/i,
    /\bTVL\b/, /\b\d[\d,.]*\+?\s*(?:users|wallets)\b/i, /\bformally verified\b/i, /\bmainnet live\b/i,
  ];
  for (const re of banned) assert.doesNotMatch(text, re, `banned phrase ${re}`);
  // integrations are described as in progress, never as shipped partnerships
  assert.match(text, /We are integrating these/);
  assert.match(text, /no partnership/);
});

test("served pages carry no Cloudflare edge injections", () => {
  for (const p of ["index.html", "article/index.html", "solana-foundation/index.html"]) {
    const s = read(p);
    assert.ok(!s.includes("__CF$cv$params") && !s.includes(".webmcp/bridge.js"), p);
  }
  assert.ok(existsSync(join(pub, "article-hero.webp")));
});
