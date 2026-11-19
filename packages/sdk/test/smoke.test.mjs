// Run after `npm run build`. Checks that the published entry points load in Node
// and that the bundled IDL matches the program's spend-authorization interface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const idl = JSON.parse(readFileSync(new URL("../src/idl/dark_protocol_program.json", import.meta.url), "utf8"));

test("ESM entry loads in Node", async () => {
  const m = await import("../dist/index.js");
  assert.equal(typeof m.DarkProtocolClient, "function");
  assert.equal(typeof m.ShieldedWallet, "function");
});

test("CJS entry loads in Node", () => {
  const m = require("../dist/index.cjs");
  assert.equal(typeof m.DarkProtocolClient, "function");
});

test("IDL: withdraw is signed by the note owner, recipient need not sign", () => {
  const w = idl.instructions.find((i) => i.name === "withdraw");
  const owner = w.accounts.find((a) => a.name === "owner");
  const recipient = w.accounts.find((a) => a.name === "recipient");
  assert.equal(owner.signer, true);
  assert.ok(!recipient.signer);
});

test("IDL: shielded_transfer names output owners; ciphertexts go through post_ciphertext", () => {
  const t = idl.instructions.find((i) => i.name === "shielded_transfer");
  const args = t.args.map((a) => a.name);
  assert.deepEqual(args.slice(-2), ["owner_1", "owner_2"]);
  assert.ok(!args.some((a) => a.startsWith("enc_ciphertext")));
  assert.ok(idl.instructions.some((i) => i.name === "post_ciphertext"));
  assert.ok(idl.errors.some((e) => e.name === "NotNoteOwner"));
});

test("bundled client IDL is the generated one", () => {
  const bundle = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  assert.ok(bundle.includes("post_ciphertext"));
  assert.ok(bundle.includes("NotNoteOwner"));
});
