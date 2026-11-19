#!/usr/bin/env python3
"""Build the dark-protocol-page worker: main page + article page + embedded hero webp."""
import base64, json, pathlib

PAGE_DIR = pathlib.Path("/home/hatch/workspace/dark-protocol-page")
ART_DIR = pathlib.Path("/home/hatch/workspace/dark-protocol-article")

main_html = (PAGE_DIR / "index.html").read_bytes()
article_html = (PAGE_DIR / "article.html").read_bytes()
hero = (ART_DIR / "media-generation-dark-protocol-article-hero-0-4cb35887-9127-4219-bd1b-d1ea348f2c56.webp").read_bytes()
hero_b64 = base64.b64encode(hero).decode()

worker = """const MAIN_PAGE = __MAIN__;
const ARTICLE_PAGE = __ARTICLE__;
const HERO_B64 = __HERO__;

let heroBytes = null;
function getHero() {
  if (!heroBytes) {
    const bin = atob(HERO_B64);
    heroBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) heroBytes[i] = bin.charCodeAt(i);
  }
  return heroBytes;
}

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=300'
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let p = url.pathname;
    // Normalise: strip a leading /dark-protocol prefix so the same routes
    // work on darkx402.com (zone route) and protocol.darkx402.com (custom domain).
    if (p === '/dark-protocol') p = '/';
    else if (p.startsWith('/dark-protocol/')) p = p.slice('/dark-protocol'.length);
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

    if (p === '/article') {
      return new Response(ARTICLE_PAGE, { headers: HTML_HEADERS });
    }
    if (p === '/article-hero.webp') {
      return new Response(getHero(), {
        headers: {
          'content-type': 'image/webp',
          'cache-control': 'public, max-age=86400'
        }
      });
    }
    // Everything else keeps the original behaviour: serve the explainer page.
    return new Response(MAIN_PAGE, { headers: HTML_HEADERS });
  }
};
"""

worker = worker.replace("__MAIN__", json.dumps(main_html.decode("utf-8")))
worker = worker.replace("__ARTICLE__", json.dumps(article_html.decode("utf-8")))
worker = worker.replace("__HERO__", json.dumps(hero_b64))

out = PAGE_DIR / "worker.js"
out.write_text(worker)
print("main_html bytes:   ", len(main_html))
print("article_html bytes:", len(article_html))
print("hero webp bytes:   ", len(hero), " base64:", len(hero_b64))
print("worker.js bytes:   ", len(worker.encode()))
print("worker.js KiB:     ", round(len(worker.encode()) / 1024, 1), "of 1024 KiB free-plan limit")
