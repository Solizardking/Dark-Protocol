import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePath } from "../worker.js";
import { loadData, validate, render, pagePath, dataDir, LABELS } from "../scripts/quantum-lib.mjs";

const data = loadData();
const page = readFileSync(pagePath, "utf8");
const text = page.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("quantum routes resolve on both hosts", () => {
  for (const p of ["/quantum", "/research/quantum", "/dark-protocol/quantum", "/dark-protocol/research/quantum/"])
    assert.deepEqual(resolvePath(p), { asset: "/quantum/index.html", status: 200 });
});

test("research data passes schema, label and primary-source checks", () => {
  assert.deepEqual(validate(data), []);
});

test("validator rejects bad labels, missing sources and non-primary hosts", () => {
  const bad = structuredClone(data);
  bad.entries.entries[0].label = "proven";
  bad.entries.entries[1].sources = [];
  bad.entries.entries[2].sources = [{ title: "news", url: "https://example-news.com/story" }];
  bad.entries.entries[3].id = bad.entries.entries[4].id;
  const errs = validate(bad).join("\n");
  assert.match(errs, /label must be one of/);
  assert.match(errs, /needs at least one source/);
  assert.match(errs, /not on the primary-source host list/);
  assert.match(errs, /duplicate id/);
});

test("generated page is in sync with the data (run scripts/build-quantum.mjs)", () => {
  assert.equal(page, render(data));
});

test("page renders every entry and claim, and does not publish the stack inventory", () => {
  for (const e of data.entries.entries) assert.match(page, new RegExp(`id="${e.id}"`));
  for (const id of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]) assert.match(text, new RegExp(`\\b${id}\\b`));
  for (const l of LABELS) assert.match(text, new RegExp(l));
  assert.match(text, /Research-only/);
  assert.doesNotMatch(text, /Stack exposure inventory/);
  assert.doesNotMatch(page, /id="inventory"/);
  assert.doesNotMatch(text, /X25519/);
  assert.doesNotMatch(text, /Treasury/);
  assert.doesNotMatch(text, /upgrade authorit/);
  assert.doesNotMatch(text, /exposure/);
  assert.equal(Object.hasOwn(data, "inventory"), false);
});

test("LOOP.md holds the ordered nine-item worklist with cycle 1 done and #2 next", () => {
  const loop = readFileSync(join(dataDir, "LOOP.md"), "utf8");
  const rows = [...loop.matchAll(/^\| (\d) \| (.+?) \| (.+?) \|$/gm)].map((m) => [Number(m[1]), m[2], m[3]]);
  assert.deepEqual(rows.map((r) => r[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(rows[0][1], /Solana PQ signature paths/);
  assert.match(rows[0][2], /^DONE 2026-11-25/);
  assert.match(rows[1][1], /BIP-360/);
  assert.equal(rows[1][2], "**NEXT**");
  assert.equal(rows.filter((r) => r[2].includes("NEXT")).length, 1);
  assert.match(rows[8][1], /C1–C8/);
});

test("every entry's note file exists and cites the entry's sources", () => {
  for (const e of data.entries.entries) {
    const note = readFileSync(join(dataDir, "..", "..", e.note), "utf8");
    for (const s of e.sources) assert.ok(note.includes(s.url) || s.url === "https://clawdcompute.us/research", `${e.id}: ${s.url} not in note`);
  }
});

test("no unsupported claims on the quantum page", () => {
  for (const re of [/\baudited by\b/i, /\bquantum[- ]proof\b/i, /\bunbreakable\b/i, /\bguaranteed\b/i, /\bformally verified\b/i])
    assert.doesNotMatch(text, re);
});
