// Cloudflare Worker for protocol.darkx402.com and darkx402.com/dark-protocol*.
// Static files live in ./public and are served through the ASSETS binding.
// The same pages answer on both hosts: a leading "/dark-protocol" is stripped.

const PREFIX = "/dark-protocol";

const ROUTES = {
  "/": "/index.html",
  "/article": "/article/index.html",
  "/solana-foundation": "/solana-foundation/index.html",
  "/verification": "/solana-foundation/index.html",
};

export function resolvePath(pathname) {
  let p = pathname;
  if (p === PREFIX || p.startsWith(PREFIX + "/")) p = p.slice(PREFIX.length) || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (Object.prototype.hasOwnProperty.call(ROUTES, p)) return { asset: ROUTES[p], status: 200 };
  if (/\.(webp|png|jpg|svg|ico|txt|xml)$/.test(p)) return { asset: p, status: 200 };
  return { asset: "/index.html", status: 404 };
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    const { asset, status } = resolvePath(url.pathname);
    const res = await env.ASSETS.fetch(new Request(new URL(asset, url.origin), request));
    if (!res.ok) return new Response("Not Found", { status: 404 });
    const headers = new Headers(res.headers);
    headers.set("cache-control", "public, max-age=300");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    return new Response(res.body, { status, headers });
  },
};
