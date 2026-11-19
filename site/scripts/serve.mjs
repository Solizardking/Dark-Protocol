// Local preview: runs worker.js with a filesystem-backed ASSETS binding.
// Usage: node scripts/serve.mjs [port]   then open http://localhost:8787/solana-foundation
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker.js";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain" };
const env = {
  ASSETS: {
    async fetch(req) {
      const p = new URL(req.url).pathname;
      try {
        const body = await readFile(join(pub, p));
        return new Response(body, { headers: { "content-type": TYPES[extname(p)] || "application/octet-stream" } });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    },
  },
};
const port = Number(process.argv[2] || 8787);
createServer(async (req, res) => {
  const r = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`preview on http://localhost:${port}`));
