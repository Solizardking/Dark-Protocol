// Dependency-free lint for the static site: well-formed tags, required meta,
// local links that resolve, and no secrets or unsupported claims.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "../worker.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const VOID = new Set(["meta", "link", "br", "img", "hr", "input", "source", "area", "base", "col", "embed", "track", "wbr"]);
const SECRET_PATTERNS = [
  /api-key=[A-Za-z0-9-]{16,}/,
  /sk_(live|test)_[A-Za-z0-9]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/, // 64-byte keypair array
];

for (const file of walk(pub).filter((f) => f.endsWith(".html"))) {
  const rel = file.slice(root.length + 1);
  const html = readFileSync(file, "utf8");
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  // tag balance
  const stack = [];
  for (const m of body.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const tag = m[1].toLowerCase();
    if (VOID.has(tag) || m[2] === "/" || tag === "!doctype") continue;
    if (m[0].startsWith("</")) {
      const top = stack.pop();
      if (top !== tag) { errors.push(`${rel}: expected </${top}> but found </${tag}>`); break; }
    } else stack.push(tag);
  }
  if (stack.length) errors.push(`${rel}: unclosed tags: ${stack.join(", ")}`);

  if (!/<title>[^<]{10,}<\/title>/.test(html)) errors.push(`${rel}: missing <title>`);
  if (!/<meta name="description" content="[^"]{40,}">/.test(html)) errors.push(`${rel}: missing meta description`);
  if (!/<meta name="viewport"/.test(html)) errors.push(`${rel}: missing viewport`);
  if (!/href="\/dark-protocol\/solana-foundation"/.test(html)) errors.push(`${rel}: no nav link to the Solana Foundation page`);

  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const { asset, status } = resolvePath(m[1]);
    if (status !== 200 || !existsSync(join(pub, asset))) errors.push(`${rel}: local link ${m[1]} does not resolve`);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(m[0])) errors.push(`${rel}: <img> without alt`);
  for (const re of SECRET_PATTERNS) if (re.test(html)) errors.push(`${rel}: looks like a secret (${re})`);
}

if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log("site lint: ok");
