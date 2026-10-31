#!/usr/bin/env node
// Writes a real, indexable HTML page for every curriculum module into dist/,
// plus dist/sitemap.xml listing them all. The last step of `npm run build`.
//
// Each page is the built app shell (same hashed JS/CSS) with the module's own
// <title>, description, canonical URL, social tags and structured data, and
// the module itself rendered by the app's own renderMarkdownDoc inside #root.
// Crawlers, link previews and no-JS readers get the full page; for everyone
// else React replaces #root on boot, and the copy stays hidden until then so
// there is no flash of it. The page also asks the browser to start fetching
// the module's markdown straight away, instead of after the app has started.

import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdownDoc } from '../../webapp/src/lib/markdown/markdown.js';
import { moduleUrl, routeUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import { resolvePath } from '../../webapp/src/lib/markdown/rewriteLinks.js';
import { buildPageTitles } from '../../webapp/src/lib/curriculum/pageTitle.js';
import { neighbourModules } from '../../webapp/src/lib/curriculum/curriculumPosition.js';
import { formatClock, groupByModule, isoDuration } from '../../webapp/src/lib/curriculum/videos.js';
import { thumbnailUrl, watchUrl } from '../../webapp/src/lib/markdown/video.js';
import { ROOT, CONTENT_DIR, config, SITE_URL, isPlaceholderText } from '../lib/config.mjs';
import { descriptionCandidates, pickDescription } from '../lib/describe.mjs';
import { gitDates } from '../lib/gitDates.mjs';

const SITE = SITE_URL;
const SITE_NAME = config.site.name;
const DIST = path.join(ROOT, 'dist');

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const { tree } = JSON.parse(fs.readFileSync(path.join(DIST, 'docs-index.json'), 'utf8'));
const titles = buildPageTitles(tree, SITE_NAME);
const dates = gitDates(ROOT, CONTENT_DIR); // null without full history (a shallow clone): the dates are then left out
// The channel's videos by module (dist/videos.json, written by gen-videos.mjs in `npm run index`).
const videosFile = path.join(DIST, 'videos.json');
const videosByFile = fs.existsSync(videosFile) ? groupByModule(JSON.parse(fs.readFileSync(videosFile, 'utf8')).videos) : {};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Same lookups the app builds in useDocsIndex, for resolving internal links.
const fileSet = new Set();
const dirIndex = {};
const nodeByFile = {};
const modules = [];
(function walk(nodes, ancestors) {
  for (const n of nodes) {
    if (n.file) {
      fileSet.add(n.file);
      nodeByFile[n.file] = n;
      if (!n.name.endsWith('.md')) dirIndex[n.path] = n.file;
      modules.push({ node: n, ancestors });
    }
    if (n.children?.length) walk(n.children, n.file ? [...ancestors, n] : ancestors);
  }
})(tree, []);
const flatFiles = modules.map((m) => m.node.file);

const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:)?\/\//i;
const brokenLinks = [];

// Mirrors lib/markdown/rewriteLinks.js, on the HTML string instead of the DOM. A relative link to something that
// is not in the site is a dead end for readers and crawlers alike, so those are collected and reported.
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
      else if (!fs.existsSync(path.join(DIST, clean))) brokenLinks.push(`${file} -> ${href}`);
      return `${pre}${target ? routeUrl(target, hash || null) : '/' + resolved + (hash ? '#' + hash : '')}"`;
    });
}

function replaceOnce(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: template no longer contains ${pattern}`);
  return html.replace(pattern, () => replacement);
}

const HIDE_UNTIL_NO_JS =
  '<style>.prerender{display:none}</style>' +
  '<noscript><style>.prerender{display:block;max-width:760px;margin:0 auto;padding:24px 20px;line-height:1.6}</style></noscript>';

const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// Who is behind the site, for search engines to connect the pages, the repository and the channel.
const author = {
  '@type': 'Person',
  name: config.developer.name,
  url: config.developer.linkedin,
  sameAs: [config.developer.linkedin, config.developer.github, config.youtube.channel]
};
const publisher = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE + '/',
  logo: { '@type': 'ImageObject', url: SITE + config.site.logo }
};

// image: a page's own picture for link previews (a module with a video shows the video's thumbnail), instead of the site's.
function page({ title, fullTitle, description, url, type, ld, body, preload = [], noindex = false, image = null }) {
  let html = template;
  if (image) {
    html = replaceOnce(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image.url)}">`);
    html = replaceOnce(html, /<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="${image.width}">`);
    html = replaceOnce(html, /<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="${image.height}">`);
    html = replaceOnce(html, /<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(image.alt)}">`);
    html = replaceOnce(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(image.url)}">`);
  }
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}${url}">`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}${url}">`);
  html = replaceOnce(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  const robots = noindex ? '<meta name="robots" content="noindex, follow">' : '';
  const preloads = preload.map((href) => `<link rel="preload" href="${esc(href)}" as="fetch" crossorigin>`).join('');
  html = replaceOnce(html, /<\/head>/, `${robots}${preloads}${HIDE_UNTIL_NO_JS}${jsonLd(ld)}</head>`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root"><div class="prerender">${body}</div></div>`);
  return html;
}

const link = (url, text) => `<a href="${url}">${esc(text)}</a>`;

// A module's video as plain HTML (for crawlers and readers without JavaScript): a link to it with its thumbnail, and its
// chapters. The app draws its own player in the page; this is what the page says without one.
const videoHtml = (v) => `<section aria-label="Video"><p><a href="${watchUrl(v.id)}"><img src="${thumbnailUrl(v.id)}" alt="" width="480" height="360"> ${esc(v.title)}</a>${v.seconds ? ` (${formatClock(v.seconds)})` : ''}</p>`
  + (v.chapters.length ? `<ol>${v.chapters.map(([t, name]) => `<li>${formatClock(t)} ${esc(name)}</li>`).join('')}</ol>` : '') + '</section>';

// The same video as structured data, which is what lets a search result show it as a video.
const videoObject = (v, fallbackDescription) => ({
  '@type': 'VideoObject',
  name: v.title,
  description: v.summary || fallbackDescription,
  thumbnailUrl: thumbnailUrl(v.id),
  uploadDate: v.published,
  ...(v.seconds && { duration: isoDuration(v.seconds) }),
  embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
  inLanguage: 'en',
  author
});

// What a crawler or a reader without JavaScript needs to walk on from a page: the modules inside a track, and the
// modules on either side of this one (the app shows the same two things as the sidebar and the pager).
function walkOn(node) {
  let html = '';
  const inside = (node.children || []).filter((c) => c.file && !c.planned && moduleUrl(c.file));
  if (inside.length) {
    html += `<nav aria-label="In this section"><h2>In this section</h2><ul>${inside.map((c) => `<li>${link(moduleUrl(c.file), titles[c.file].title)}</li>`).join('')}</ul></nav>`;
  }
  const { prev, next } = neighbourModules(flatFiles, nodeByFile, node.file);
  const pager = [prev && `Previous: ${link(moduleUrl(prev), titles[prev].title)}`, next && `Next: ${link(moduleUrl(next), titles[next].title)}`].filter(Boolean);
  if (pager.length) html += `<nav aria-label="Previous and next"><p>${pager.join(' · ')}</p></nav>`;
  return html;
}

const urls = [{ url: '/' }];
const takenDescriptions = new Set();
let written = 0;
let skipped = 0;

for (const { node, ancestors } of modules) {
  const url = moduleUrl(node.file);
  const source = path.join(DIST, node.file);
  if (!url || !fs.existsSync(source)) continue;

  const { title, full } = titles[node.file];
  const raw = fs.readFileSync(source, 'utf8');
  // An unwritten module is a placeholder, not content: keep it out of the index
  // and the sitemap (thin pages drag down a whole site's ranking). It reappears
  // on the next build once someone writes it. Same marker the app checks
  // (webapp/src/lib/curriculum/contribute.js); both read it from site.config.json.
  const placeholder = isPlaceholderText(raw);
  const html = rewriteLinks(renderMarkdownDoc(raw), node.file);
  const track = ancestors[0] ? titles[ancestors[0].file].title : title;
  const description = pickDescription(descriptionCandidates(html), takenDescriptions, `${title} — a module in the ${track} curriculum on ${SITE_NAME}.`);

  const crumbs = [{ title: SITE_NAME, url: '/' }, ...ancestors.map((a) => ({ title: titles[a.file].title, url: moduleUrl(a.file) })).filter((c) => c.url), { title, url }];
  const nav = crumbs.slice(0, -1).map((c) => link(c.url, c.title)).join(' › ');
  const when = dates && dates[node.file];
  const clips = videosByFile[node.file] || [];

  const out = page({
    title,
    fullTitle: full,
    description,
    url,
    type: 'article',
    noindex: placeholder,
    image: clips.length ? { url: thumbnailUrl(clips[0].id), width: 480, height: 360, alt: clips[0].title } : null,
    preload: ['/' + node.file],
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: title,
          description,
          url: SITE + url,
          mainEntityOfPage: SITE + url,
          inLanguage: 'en',
          keywords: (node.tags || []).join(', '),
          image: SITE + config.site.socialImage,
          author,
          publisher,
          ...(when && { datePublished: when.created, dateModified: when.modified }),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE + '/' }
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, item: SITE + c.url }))
        },
        ...clips.map((v) => videoObject(v, description))
      ]
    },
    body: `<nav aria-label="Breadcrumb">${nav}</nav>${clips.map(videoHtml).join('')}<article>${html}</article>${walkOn(node)}`
  });

  const dir = path.join(DIST, ...decodeURIComponent(url).split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  if (!placeholder) urls.push({ url, lastmod: when && when.modified });
  written++;
  if (placeholder) skipped++;
}

// Home: the tracks and their sections, so crawlers can walk in from the root.
const homeLinks = tree.filter((t) => t.file).map((t) => {
  const kids = (t.children || []).filter((c) => moduleUrl(c.file))
    .map((c) => `<li>${link(moduleUrl(c.file), titles[c.file].title)}</li>`).join('');
  return `<li>${link(moduleUrl(t.file), titles[t.file].title)}${kids ? `<ul>${kids}</ul>` : ''}</li>`;
}).join('');
const homeDescription = (template.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '';
// Google takes a site's name in results from WebSite data on the homepage;
// alternateName covers how people actually type it.
let home = replaceOnce(template, /<\/head>/, `${HIDE_UNTIL_NO_JS}${jsonLd({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: ['BackendRoadmap', 'backendroadmap.com'],
      url: SITE + '/',
      publisher: { '@id': SITE + '/#author' }
    },
    { ...author, '@id': SITE + '/#author' }
  ]
})}</head>`);
home = replaceOnce(home, /<div id="root"><\/div>/,
  `<div id="root"><div class="prerender"><h1>${esc(SITE_NAME)}</h1><p>${homeDescription}</p><ul>${homeLinks}</ul></div></div>`);
fs.writeFileSync(path.join(DIST, 'index.html'), home);

const newest = urls.map((u) => u.lastmod).filter(Boolean).sort().at(-1);
if (newest) urls[0].lastmod = newest;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${esc(SITE + u.url)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
  '\n</urlset>\n');

console.log(`prerender: ${written} module pages (${skipped} placeholders set to noindex), sitemap with ${urls.length} URLs${dates ? ', dated from git history' : ', no dates (no full git history here)'}`);
if (brokenLinks.length) {
  console.warn(`prerender: ${brokenLinks.length} internal link(s) point at a page that does not exist:\n  ${brokenLinks.slice(0, 15).join('\n  ')}`);
}
