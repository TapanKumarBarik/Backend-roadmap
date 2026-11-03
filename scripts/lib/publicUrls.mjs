// The site's public addresses, as the build leaves them in dist/, and what is registered about each (docs/url-registry.tsv). A
// published address is a promise: it is in YouTube descriptions, other sites, search results and bookmarks, so a build that loses
// one, or turns an indexed page into one that is not, is a build that must not ship. scripts/check/check-urls.mjs enforces it.
import fs from 'node:fs';
import path from 'node:path';

/** Files in dist/ that are not pages to anyone: the app shell the server pages are made from, and the 404 page. */
const NOT_PUBLIC = new Set(['app-shell.html', '404.html']);

/** Every file under `dir`, as paths relative to it with forward slashes. */
export function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** The address a built HTML file answers: `a/b/index.html` is `/a/b/`, `privacy.html` is `/privacy.html`. */
export function addressOf(file) {
  if (file === 'index.html') return '/';
  return file.endsWith('/index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`;
}

/** What a page says about itself that a search engine reads: its canonical address, whether it asks not to be indexed, a body. */
export function pageFacts(html) {
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html);
  const href = canonical && /href=["']([^"']+)["']/i.exec(canonical[0]);
  const robots = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html);
  const prerendered = /<div[^>]+class=["'][^"']*prerender[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/body>/i.exec(html);
  return {
    canonical: href ? href[1] : null,
    indexable: !(robots && /noindex/i.test(robots[0])),
    title: ((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '').trim(),
    textLength: prerendered ? prerendered[1].replace(/<[^>]+>/g, '').trim().length : 0
  };
}

/** The public pages of a built site: { '/a/b/': facts }. Pages the app answers from its shell (the hash screens) are not files. */
export function pagesOf(dist) {
  const pages = {};
  for (const file of walk(dist)) {
    if (!file.endsWith('.html') || NOT_PUBLIC.has(file) || file.startsWith('assets/')) continue;
    pages[addressOf(file)] = pageFacts(fs.readFileSync(path.join(dist, file), 'utf8'));
  }
  return pages;
}

/** The files at the top of dist/ that are addresses of their own (the sitemap, robots.txt, the video list): { '/videos.json': true }. */
export function filesOf(dist) {
  return Object.fromEntries(fs.readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.html') && !entry.name.startsWith('_'))
    .map((entry) => [`/${entry.name}`, true]));
}

/** The addresses a sitemap lists, as paths. */
export function sitemapPaths(xml, siteUrl) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((loc) => loc.startsWith(siteUrl)).map((loc) => loc.slice(siteUrl.replace(/\/$/, '').length));
}

/**
 * The registry: one line for each address, `<path>`, then tab-separated 1 or 0 for: search engines may index it, it names a canonical
 * address, it carries text a crawler sees; or `<path>` and `file`. Lines starting with # are notes.
 */
export function readRegistry(text) {
  const entries = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [address, indexable, canonical, text] = line.split('\t');
    entries[address] = { kind: indexable === 'file' ? 'file' : 'page', indexable: indexable === '1', canonical: canonical === '1', text: text === '1' };
  }
  return entries;
}

export function writeRegistry(pages, files, header) {
  const lines = Object.keys(pages).sort().map((address) => `${address}\t${pages[address].indexable ? 1 : 0}\t${pages[address].canonical ? 1 : 0}\t${pages[address].textLength > 0 ? 1 : 0}`);
  const others = Object.keys(files).sort().map((address) => `${address}\tfile`);
  return `${header}\n${lines.join('\n')}\n${others.join('\n')}\n`;
}

/** A _redirects file (Cloudflare Pages): [{ from, to, status }], skipping notes. */
export function readRedirects(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const [from, to, status = '302'] = line.split(/\s+/);
    return { from, to, status: Number(status) };
  });
}
