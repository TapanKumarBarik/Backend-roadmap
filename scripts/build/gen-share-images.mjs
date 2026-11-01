#!/usr/bin/env node
// Draws a share card for every page of the site into dist/og/: the picture LinkedIn, X, Slack and the like show beside a
// link (og:image), with the page's own title on it instead of one picture for the whole site. Part of `npm run build`,
// after the content is copied and before the pre-render step names each card in its page.
//
// satori lays the card out (it is HTML-and-CSS-shaped data in, SVG out) and resvg turns the SVG into a PNG, both in
// plain Node: no browser. What a card says and how big its title is set live in scripts/lib/shareImage.mjs (tested);
// the look of the card, its colours and size are in site.config.json (shareImage).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import { groupByModule } from '../../webapp/src/lib/curriculum/videos.js';
import { ROOT, config, SITE_URL } from '../lib/config.mjs';
import { cardFor, fitTitle, logoSvg, printable, shareImagePath, withAlpha } from '../lib/shareImage.mjs';

const { dir: CARD_DIR, width: WIDTH, height: HEIGHT, colors } = config.shareImage;
const DIST = path.join(ROOT, 'dist');

// The face the cards are set in (Inter, from the @fontsource package): the weights a card uses, read once.
const fontFile = (weight) => createRequire(import.meta.url).resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`);
const WEIGHTS = /** @type {const} */ ([600, 700, 800]);
const fonts = WEIGHTS.map((weight) => ({ name: 'Inter', data: fs.readFileSync(fontFile(weight)), weight, style: /** @type {const} */ ('normal') }));

const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ tile: colors.text, ink: colors.background, dot: colors.logoDot })).toString('base64')}`;
const host = new URL(SITE_URL).host;

// satori takes elements as { type, props }; this is `h('div', style, children)`.
const h = (type, style, children) => ({ type, props: { style, children } });

/** @param {{ title: string, kicker: string, badge: string | null, pill: string }} card */
function cardElement(card) {
  const title = fitTitle(printable(card.title) || config.site.name);
  const chip = (text) => h('div', {
    display: 'flex', fontSize: 22, fontWeight: 600, color: colors.muted, padding: '8px 20px', borderRadius: 999,
    border: `1px solid ${withAlpha(colors.text, 0.18)}`, backgroundColor: withAlpha(colors.text, 0.05)
  }, text);
  const pill = (text) => h('div', {
    display: 'flex', fontSize: 28, fontWeight: 700, padding: '12px 28px', borderRadius: 12, backgroundColor: colors.accent, color: colors.onAccent
  }, text);

  // Two flat rings of the accent colour behind the top right corner, instead of a soft glow: a gradient makes every card a
  // PNG two to three times the size, and there are hundreds of them.
  const ring = (size, alpha) => h('div', {
    position: 'absolute', top: -size / 2 + 40, right: -size / 2 + 120, width: size, height: size, borderRadius: size, backgroundColor: withAlpha(colors.accent, alpha)
  }, []);

  return h('div', {
    position: 'relative', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', width: WIDTH, height: HEIGHT, padding: '56px 80px',
    fontFamily: 'Inter', color: colors.text, backgroundColor: colors.background
  }, [
    ring(760, 0.06),
    ring(460, 0.08),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', alignItems: 'center' }, [
        { type: 'img', props: { src: logo, width: 56, height: 56 } },
        h('div', { display: 'flex', marginLeft: 18, fontSize: 32, fontWeight: 700 }, config.site.name)
      ]),
      ...(card.badge ? [chip(printable(card.badge))] : [])
    ]),
    h('div', { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }, [
      h('div', { display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: colors.accent }, printable(card.kicker)),
      h('div', { display: 'flex', marginTop: 20, fontSize: title.size, fontWeight: 800, lineHeight: title.lineHeight, letterSpacing: -1.5 }, title.text)
    ]),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', fontSize: 28, color: colors.muted }, [
        h('div', { display: 'flex', fontWeight: 700, color: colors.text }, host),
        h('div', { display: 'flex', marginLeft: 14 }, `· Open source · ${config.site.license}`)
      ]),
      ...(card.pill ? [pill(card.pill)] : [])
    ])
  ]);
}

const { tree } = JSON.parse(fs.readFileSync(path.join(DIST, 'docs-index.json'), 'utf8'));
const videosFile = path.join(DIST, 'videos.json');
const videosByFile = fs.existsSync(videosFile) ? groupByModule(JSON.parse(fs.readFileSync(videosFile, 'utf8')).videos) : {};

// Every page a link can point at, except an unwritten module with no video: that page is kept out of search results
// (scripts/build/prerender.mjs), so a link to it shows the site's own picture rather than one more card.
const pages = [];
(function walk(nodes, ancestors) {
  for (const node of nodes) {
    if (node.file && moduleUrl(node.file) && !(node.planned && !videosByFile[node.file])) pages.push({ node, ancestors });
    if (node.children?.length) walk(node.children, node.file ? [...ancestors, node] : ancestors);
  }
})(tree, []);

fs.rmSync(path.join(DIST, CARD_DIR), { recursive: true, force: true });
const started = Date.now();
for (const { node, ancestors } of pages) {
  const card = cardFor({ node, ancestors, clips: videosByFile[node.file] || [] });
  const svg = await satori(/** @type {any} */ (cardElement(card)), { width: WIDTH, height: HEIGHT, fonts });
  // The text is already outlines, so resvg needs no fonts of its own; looking through the system's for each card cost 130 ms of the 150.
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: false } }).render().asPng();
  const file = path.join(DIST, shareImagePath(CARD_DIR, /** @type {string} */ (moduleUrl(node.file))));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
}
console.log(`Wrote ${pages.length} share cards to dist/${CARD_DIR}/ (${WIDTH}x${HEIGHT}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
