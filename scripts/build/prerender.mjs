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
import { isModule } from '../../webapp/src/lib/curriculum/nodeKind.js';
import { formatClock, groupByModule, isoDuration } from '../../webapp/src/lib/curriculum/videos.js';
import { thumbnailUrl, watchUrl } from '../../webapp/src/lib/markdown/video.js';
import { ROOT, CONTENT_DIR, config, SITE_URL, isPlaceholderText } from '../lib/config.mjs';
import { descriptionCandidates, videoCandidates } from '../lib/describe.mjs';
import { pageSeo } from '../lib/seoPage.mjs';
import { gitDates } from '../lib/gitDates.mjs';
import { homePage } from '../lib/homePage.mjs';
import { shareImagePath, shareImageUrl } from '../lib/shareImage.mjs';
import { listingPages } from '../lib/listingPages.mjs';
import { LEARNING_PATHS } from '../../webapp/src/config/paths.js';
import { resolvePaths } from '../../webapp/src/lib/curriculum/learningPaths.js';
import { escapeHtml as esc, shellPage } from '../../webapp/src/lib/seo/shellPage.js';
import { descriptionsTaken } from '../../webapp/src/lib/siteContent/seo.js';

const SITE = SITE_URL;
const SITE_NAME = config.site.name;
const SHARE_CARD = config.shareImage;
const DIST = path.join(ROOT, 'dist');

// The app shell, before any page is written into it. dist/app-shell.html is a copy of it kept for the pages that are
// drawn when they are asked for (edge/blogPages.js); a second run of this step starts from that copy, because by then
// index.html is the home page.
const SHELL_COPY = path.join(DIST, 'app-shell.html');
const template = fs.readFileSync(fs.existsSync(SHELL_COPY) ? SHELL_COPY : path.join(DIST, 'index.html'), 'utf8');
if (!fs.existsSync(SHELL_COPY)) fs.writeFileSync(SHELL_COPY, template);
// `seo`: the titles and descriptions an editor wrote by hand (content/seo.json), which replace the generated ones.
const { tree, seo = {} } = JSON.parse(fs.readFileSync(path.join(DIST, 'docs-index.json'), 'utf8'));
const titles = buildPageTitles(tree, SITE_NAME);
const dates = gitDates(ROOT, CONTENT_DIR); // null without full history (a shallow clone): the dates are then left out
// The channel's videos, and by module (dist/videos.json, written by gen-videos.mjs in `npm run index`).
const videosFile = path.join(DIST, 'videos.json');
const videosData = fs.existsSync(videosFile) ? JSON.parse(fs.readFileSync(videosFile, 'utf8')) : { videos: [], playlists: [] };
// Only videos already public on YouTube (a scheduled one is private until its time); the app applies the same rule.
const videoList = videosData.videos.filter((v) => !v.published || Date.parse(v.published) <= Date.now());
const videosByFile = groupByModule(videoList);

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

// image: a page's own picture for link previews (its share card, scripts/build/gen-share-images.mjs), instead of the site's.
const page = (options) => shellPage(template, SITE, options);

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

// A page worth walking on to and indexing: a written module, or an unwritten one that has a video (its page is the video,
// its chapters and what it covers, which is what someone searching for the topic wants).
const isWorthIndexing = (node) => isModule(node) || Boolean(videosByFile[node.file]);

// What a crawler or a reader without JavaScript needs to walk on from a page: the modules inside a track, and the
// modules on either side of this one (the app shows the same two things as the sidebar and the pager).
function walkOn(node) {
  let html = '';
  const inside = (node.children || []).filter((c) => c.file && moduleUrl(c.file) && (!c.planned || isWorthIndexing(c)));
  if (inside.length) {
    html += `<nav aria-label="In this section"><h2>In this section</h2><ul>${inside.map((c) => `<li>${link(moduleUrl(c.file), titles[c.file].title)}</li>`).join('')}</ul></nav>`;
  }
  const { prev, next } = neighbourModules(flatFiles, nodeByFile, node.file, isWorthIndexing);
  const pager = [prev && `Previous: ${link(moduleUrl(prev), titles[prev].title)}`, next && `Next: ${link(moduleUrl(next), titles[next].title)}`].filter(Boolean);
  if (pager.length) html += `<nav aria-label="Previous and next"><p>${pager.join(' · ')}</p></nav>`;
  return html;
}

const urls = [{ url: '/' }];
// A description written by hand counts as taken before any page is described, so no generated one repeats it.
const takenDescriptions = descriptionsTaken(seo);
const generatedDescriptions = {}; // what each page's description would be without an override (dist/seo-defaults.json, for the admin SEO screen)
let written = 0;
let skipped = 0;

for (const { node, ancestors } of modules) {
  const url = moduleUrl(node.file);
  const source = path.join(DIST, node.file);
  if (!url || !fs.existsSync(source)) continue;

  const { title, full } = titles[node.file];
  const raw = fs.readFileSync(source, 'utf8');
  const clips = videosByFile[node.file] || [];
  // An unwritten module is a placeholder, not content: keep it out of the index
  // and the sitemap (thin pages drag down a whole site's ranking). It reappears
  // on the next build once someone writes it. Same marker the app checks
  // (webapp/src/lib/curriculum/contribute.js); both read it from site.config.json.
  // One that has a video is not thin, though: its page is the video, its chapters and
  // what it covers, so it is indexed (as a page about the video) until the text is written.
  const unwritten = isPlaceholderText(raw);
  const thin = unwritten && !clips.length;
  const html = rewriteLinks(renderMarkdownDoc(raw), node.file);
  const track = ancestors[0] ? titles[ancestors[0].file].title : title;
  const seoOf = pageSeo({
    override: seo[node.file],
    title,
    full,
    candidates: unwritten && clips.length ? videoCandidates(clips) : descriptionCandidates(html),
    taken: takenDescriptions,
    fallback: `${title} — a module in the ${track} curriculum on ${SITE_NAME}.`
  });
  const { description } = seoOf;
  generatedDescriptions[node.file] = seoOf.generated;

  const crumbs = [{ title: SITE_NAME, url: '/' }, ...ancestors.map((a) => ({ title: titles[a.file].title, url: moduleUrl(a.file) })).filter((c) => c.url), { title, url }];
  const nav = crumbs.slice(0, -1).map((c) => link(c.url, c.title)).join(' › ');
  const when = dates && dates[node.file];
  const isPartOf = { '@type': 'WebSite', name: SITE_NAME, url: SITE + '/' };
  // The page's own share card, when one was drawn for it (an unwritten module with no video has none: it keeps the site's).
  const card = fs.existsSync(path.join(DIST, shareImagePath(SHARE_CARD.dir, url)))
    ? { url: shareImageUrl(SITE, SHARE_CARD.dir, url), width: SHARE_CARD.width, height: SHARE_CARD.height, alt: `${title} · ${SITE_NAME}` }
    : null;

  const out = page({
    title: seoOf.title,
    fullTitle: seoOf.fullTitle,
    description,
    url,
    type: 'article',
    noindex: thin,
    image: card,
    preload: ['/' + node.file],
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        unwritten
          ? { '@type': 'WebPage', name: title, description, url: SITE + url, inLanguage: 'en', isPartOf }
          : {
            '@type': 'TechArticle',
            headline: title,
            description,
            url: SITE + url,
            mainEntityOfPage: SITE + url,
            inLanguage: 'en',
            keywords: (node.tags || []).join(', '),
            image: card ? card.url : SITE + config.site.socialImage,
            author,
            publisher,
            ...(when && { datePublished: when.created, dateModified: when.modified }),
            isPartOf
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
  if (!thin) urls.push({ url, lastmod: when && when.modified });
  written++;
  if (thin) skipped++;
}

fs.writeFileSync(path.join(DIST, 'seo-defaults.json'), JSON.stringify(generatedDescriptions));

// Home: what the landing page says (its paths, curricula and tracks, the newest videos), so a crawler walks in from
// the root with something to read as well as somewhere to go. Built by scripts/lib/homePage.mjs.
const stats = JSON.parse(fs.readFileSync(path.join(DIST, 'site-stats.json'), 'utf8'));
const homePageContent = homePage({
  stats, videos: videoList, tree, titles, config, urlOf: moduleUrl
});
// Google takes a site's name in results from WebSite data on the homepage;
// alternateName covers how people actually type it.
const home = page({
  title: SITE_NAME,
  fullTitle: config.site.title,
  description: homePageContent.description,
  url: '/',
  type: 'website',
  body: homePageContent.body,
  ld: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: ['BackendRoadmap', 'backendroadmap.com'],
        url: SITE + '/',
        description: homePageContent.description,
        inLanguage: 'en',
        publisher: { '@id': SITE + '/#author' }
      },
      { ...author, '@id': SITE + '/#author' }
    ]
  }
});
fs.writeFileSync(path.join(DIST, 'index.html'), home);

// The learning paths and the video lectures have pages of their own (/paths/, /paths/<id>/, /videos/): the same facts the app shows,
// drawn by scripts/lib/listingPages.mjs. Each is written like a module's page, and the sitemap lists it.
const listings = listingPages({
  paths: resolvePaths(LEARNING_PATHS, dirIndex, nodeByFile, tree),
  videos: videoList,
  playlists: videosData.playlists,
  titles,
  urlOf: moduleUrl,
  site: SITE,
  siteName: SITE_NAME,
  author,
  practice: JSON.parse(fs.readFileSync(path.join(ROOT, 'api/generated/practice-content.json'), 'utf8'))
});
for (const listing of listings) {
  const out = page({
    title: listing.title,
    fullTitle: listing.fullTitle,
    description: listing.description,
    url: listing.url,
    type: 'website',
    body: listing.body,
    ld: listing.ld
  });
  const dir = path.join(DIST, ...listing.url.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  urls.push({ url: listing.url });
}

const newest = urls.map((u) => u.lastmod).filter(Boolean).sort().at(-1);
if (newest) urls[0].lastmod = newest;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${esc(SITE + u.url)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
  '\n</urlset>\n');

console.log(`prerender: ${written} module pages (${skipped} placeholders without a video set to noindex), ${listings.length} path and video pages, sitemap with ${urls.length} URLs${dates ? ', dated from git history' : ', no dates (no full git history here)'}`);
if (brokenLinks.length) {
  console.warn(`prerender: ${brokenLinks.length} internal link(s) point at a page that does not exist:\n  ${brokenLinks.slice(0, 15).join('\n  ')}`);
}
