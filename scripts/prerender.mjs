#!/usr/bin/env node
// Writes a real, indexable HTML page for every curriculum module into dist/,
// plus dist/sitemap.xml listing them all. The last step of `npm run build`.
//
// Each page is the built app shell (same hashed JS/CSS) with the module's own
// <title>, description, canonical URL, social tags and structured data, and
// the module itself rendered by the app's own renderMarkdownDoc inside #root.
// Crawlers, link previews and no-JS readers get the full page; for everyone
// else React replaces #root on boot, and the copy stays hidden until then so
// there is no flash of it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdownDoc } from '../webapp/src/lib/markdown/markdown.js';
import { moduleUrl, routeUrl } from '../webapp/src/lib/curriculum/moduleUrl.js';
import { resolvePath } from '../webapp/src/lib/markdown/rewriteLinks.js';

const SITE = 'https://backendroadmap.com';
const SITE_NAME = 'Backend Roadmap';
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const { tree } = JSON.parse(fs.readFileSync(path.join(DIST, 'docs-index.json'), 'utf8'));

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const textOf = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?)])/g, '$1').trim();

// Same lookups the app builds in useDocsIndex, for resolving internal links.
const fileSet = new Set();
const dirIndex = {};
const modules = [];
(function walk(nodes, ancestors) {
  for (const n of nodes) {
    if (n.file) {
      fileSet.add(n.file);
      if (!n.name.endsWith('.md')) dirIndex[n.path] = n.file;
      modules.push({ node: n, ancestors });
    }
    if (n.children?.length) walk(n.children, n.file ? [...ancestors, n] : ancestors);
  }
})(tree, []);

const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:)?\/\//i;

// Mirrors lib/markdown/rewriteLinks.js, on the HTML string instead of the DOM.
function rewriteLinks(html, file) {
  const baseDir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  return html
    .replace(/(<img\b[^>]*?\ssrc=")([^"]*)"/g, (m, pre, src) => {
      if (!src || ABSOLUTE_URL.test(src) || src.startsWith('data:') || src.startsWith('/')) return m;
      return `${pre}/${resolvePath(baseDir, src)}"`;
    })
    .replace(/(<a\b[^>]*?\shref=")([^"]*)"/g, (m, pre, href) => {
      if (!href || href.startsWith('#') || href.startsWith('/') || href.startsWith('mailto:') || ABSOLUTE_URL.test(href)) return m;
      const [raw, hash] = href.split('#');
      const resolved = resolvePath(baseDir, raw);
      const clean = resolved.replace(/\/$/, '');
      let target = null;
      if (resolved.toLowerCase().endsWith('.md') && fileSet.has(resolved)) target = resolved;
      else if (dirIndex[clean]) target = dirIndex[clean];
      return `${pre}${target ? routeUrl(target, hash || null) : '/' + resolved + (hash ? '#' + hash : '')}"`;
    });
}

// First substantial paragraph, trimmed to a search-snippet length.
function describe(html, fallback) {
  for (const [, inner] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = textOf(inner);
    if (text.length < 50) continue;
    if (text.length <= 160) return text;
    return text.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  }
  return fallback;
}

function replaceOnce(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: template no longer contains ${pattern}`);
  return html.replace(pattern, replacement);
}

const HIDE_UNTIL_NO_JS =
  '<style>.prerender{display:none}</style>' +
  '<noscript><style>.prerender{display:block;max-width:760px;margin:0 auto;padding:24px 20px;line-height:1.6}</style></noscript>';

const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function page({ title, fullTitle, description, url, type, ld, body, noindex = false }) {
  let html = template;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}${url}">`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}${url}">`);
  html = replaceOnce(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  const robots = noindex ? '<meta name="robots" content="noindex, follow">' : '';
  html = replaceOnce(html, /<\/head>/, `${robots}${HIDE_UNTIL_NO_JS}${jsonLd(ld)}</head>`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root"><div class="prerender">${body}</div></div>`);
  return html;
}

const urls = ['/'];
let written = 0;
let skipped = 0;

for (const { node, ancestors } of modules) {
  const url = moduleUrl(node.file);
  const source = path.join(DIST, node.file);
  if (!url || !fs.existsSync(source)) continue;

  const title = node.title || node.name;
  const raw = fs.readFileSync(source, 'utf8');
  // An unwritten module is a placeholder, not content: keep it out of the index
  // and the sitemap (thin pages drag down a whole site's ranking). It reappears
  // on the next build once someone writes it. Same marker the app checks
  // (webapp/src/lib/curriculum/contribute.js).
  const placeholder = raw.split('\n', 25).join('\n').includes('has not been written yet');
  const html = rewriteLinks(renderMarkdownDoc(raw), node.file);
  const track = ancestors[0]?.title || title;
  const description = describe(html, `${title} — part of the ${track} curriculum on ${SITE_NAME}.`);

  const crumbs = [{ title: SITE_NAME, url: '/' }, ...ancestors.map((a) => ({ title: a.title || a.name, url: moduleUrl(a.file) })).filter((c) => c.url), { title, url }];
  const nav = crumbs.slice(0, -1).map((c) => `<a href="${c.url}">${esc(c.title)}</a>`).join(' › ');

  const out = page({
    title,
    fullTitle: `${title} · ${SITE_NAME}`,
    description,
    url,
    type: 'article',
    noindex: placeholder,
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: title,
          description,
          url: SITE + url,
          inLanguage: 'en',
          keywords: (node.tags || []).join(', '),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE + '/' }
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, item: SITE + c.url }))
        }
      ]
    },
    body: `<nav aria-label="Breadcrumb">${nav}</nav><article>${html}</article>`
  });

  const dir = path.join(DIST, ...decodeURIComponent(url).split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  if (!placeholder) urls.push(url);
  written++;
  if (placeholder) skipped++;
}

// Home: the tracks and their sections, so crawlers can walk in from the root.
const homeLinks = tree.filter((t) => t.file).map((t) => {
  const kids = (t.children || []).filter((c) => moduleUrl(c.file))
    .map((c) => `<li><a href="${moduleUrl(c.file)}">${esc(c.title || c.name)}</a></li>`).join('');
  return `<li><a href="${moduleUrl(t.file)}">${esc(t.title || t.name)}</a>${kids ? `<ul>${kids}</ul>` : ''}</li>`;
}).join('');
const homeDescription = (template.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '';
// Google takes a site's name in results from WebSite data on the homepage;
// alternateName covers how people actually type it.
let home = replaceOnce(template, /<\/head>/, `${HIDE_UNTIL_NO_JS}${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  alternateName: ['BackendRoadmap', 'backendroadmap.com'],
  url: SITE + '/'
})}</head>`);
home = replaceOnce(home, /<div id="root"><\/div>/,
  `<div id="root"><div class="prerender"><h1>${SITE_NAME}</h1><p>${homeDescription}</p><ul>${homeLinks}</ul></div></div>`);
fs.writeFileSync(path.join(DIST, 'index.html'), home);

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${esc(SITE + u)}</loc></url>`).join('\n') +
  '\n</urlset>\n');

console.log(`prerender: ${written} module pages (${skipped} placeholders set to noindex), sitemap with ${urls.length} URLs`);
