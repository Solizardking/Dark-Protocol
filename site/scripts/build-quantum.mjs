// Regenerate public/quantum/index.html from research/quantum/*.json.
// Usage: node site/scripts/build-quantum.mjs   (fails if the data is invalid)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadData, validate, render, pagePath } from "./quantum-lib.mjs";

const data = loadData();
const errors = validate(data);
if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
mkdirSync(dirname(pagePath), { recursive: true });
writeFileSync(pagePath, render(data));
console.log(`wrote ${pagePath} (${data.entries.entries.length} entries)`);
