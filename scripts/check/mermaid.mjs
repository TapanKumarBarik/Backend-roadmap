#!/usr/bin/env node
// Renders every ```mermaid fence in the curriculum with the same mermaid build the app ships, and fails if any
// diagram cannot be drawn. The app falls back to a plain code block for a diagram that fails (so one bad
// diagram never blanks a module), which means a mistake is easy to ship unnoticed; this catches it first.
//
//   npm run check:diagrams
//
// Needs a browser: screenshots.browserChannel from site.config.json (msedge), or --channel chrome, or CHROME_PATH.
// The webapp's dependencies must be installed (that is where mermaid lives).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, CONTENT_ROOT, config, CURRICULA } from '../lib/config.mjs';
import { DIAGRAMS } from '../../webapp/src/config/diagrams.js';
import { isSideways, topDown, wrappedFigures, boxActors, fitNotesToText } from '../../webapp/src/lib/markdown/diagramFit.js';

const args = process.argv.slice(2);
const channel = args.includes('--channel') ? args[args.indexOf('--channel') + 1] : config.screenshots.browserChannel;
// npm hoists workspace packages to the root node_modules; an install made before the move may still have it under webapp/.
const MERMAID_BUNDLE = ['node_modules', 'webapp/node_modules']
  .map((dir) => path.join(ROOT, dir, 'mermaid', 'dist', 'mermaid.min.js'))
  .find((candidate) => fs.existsSync(candidate));
if (!MERMAID_BUNDLE) {
  console.error('mermaid is not installed: run `npm install` first.');
  process.exit(2);
}

function readmes(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...readmes(p));
    else if (e.name === 'README.md') out.push(p);
  }
  return out;
}

// every fenced mermaid block, with where it came from
const diagrams = [];
for (const cur of CURRICULA) {
  const dir = path.join(CONTENT_ROOT, cur);
  if (!fs.existsSync(dir)) continue;
  for (const file of readmes(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    let n = 0;
    for (const m of text.matchAll(/^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
      n += 1;
      diagrams.push({ where: `${path.relative(CONTENT_ROOT, file).split(path.sep).join('/')} (diagram ${n})`, source: m[1] });
    }
  }
}
// The practice items carry diagrams too, inside their JSON files.
const FENCE = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonFiles(path.join(dir, e.name)) : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []));
}
const strings = (value) => (typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
for (const dir of ['practice']) {
  for (const file of jsonFiles(path.join(CONTENT_ROOT, dir))) {
    let n = 0;
    for (const text of strings(JSON.parse(fs.readFileSync(file, 'utf8')))) {
      for (const m of text.matchAll(FENCE)) {
        n += 1;
        diagrams.push({ where: `${path.relative(CONTENT_ROOT, file).split(path.sep).join('/')} (diagram ${n})`, source: m[1] });
      }
    }
  }
}
if (!diagrams.length) { console.log('No mermaid diagrams found.'); process.exit(0); }

const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel };
const browser = await chromium.launch(launchOptions).catch((e) => {
  console.error(`Could not start a browser (${JSON.stringify(launchOptions)}): ${e.message.split('\n')[0]}`);
  process.exit(2);
});
const page = await (await browser.newContext()).newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: fs.readFileSync(MERMAID_BUNDLE, 'utf8') });

// Same settings the app renders with (webapp/src/lib/markdown/mermaidRender.js): strict security, no auto-start, sequence messages wrapped
// (config/diagrams.js). The app may also draw a sideways flowchart top to bottom when it is too wide for its box, so that drawing is checked too.
// A sequence diagram is also measured the way the reader sees it. Mermaid draws a stick figure's name under the figure and reserves no room for it, so
// the page draws a figure whose name wraps as a box (config/diagrams.js: boxWrappedActors, lib/markdown/diagramFit.js). Here a diagram that has such a
// figure is drawn again with that change, and what is left is held to two rules: no figure's name wraps, and no text lies outside the drawing (a name
// cut off by its edge, a note that spills past it).
await page.addScriptTag({
  content: `window.wrappedFigures = ${wrappedFigures.toString()};
window.fitNotesToText = ${fitNotesToText.toString()};
window.measureDrawing = (holder, widenNotes, padding) => {
  const svg = holder.querySelector('svg');
  if (widenNotes) window.fitNotesToText(svg, padding);
  const box = svg.viewBox.baseVal;
  const outside = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).filter((t) => {
    const b = t.getBBox();
    return b.y < box.y - ${DIAGRAMS.labelSlackPx} || b.y + b.height > box.y + box.height + ${DIAGRAMS.labelSlackPx} || b.x < box.x - ${DIAGRAMS.labelSlackPx} || b.x + b.width > box.x + box.width + ${DIAGRAMS.labelSlackPx};
  }).map((t) => t.textContent.trim().slice(0, 40));
  return { names: window.wrappedFigures(holder), outside };
};`
});
const SEQUENCE = /^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/;
const items = diagrams.map((d) => ({ source: d.source, turned: isSideways(d.source) ? topDown(d.source) : null, sequence: SEQUENCE.test(d.source) }));
const results = await page.evaluate(async ({ items, wrap, widen, padding }) => {
  const w = /** @type {any} */ (window);
  const mermaid = w.mermaid;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', sequence: { wrap } });
  const holder = document.createElement('div');
  document.body.append(holder);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const { svg } = await mermaid.render(`check-${i}`, items[i].source);
      let drawing = null;
      if (items[i].sequence) { holder.innerHTML = svg; drawing = w.measureDrawing(holder, widen, padding); holder.innerHTML = ''; }
      if (items[i].turned) {
        try { await mermaid.render(`check-${i}-down`, items[i].turned); }
        catch (e) { out.push({ error: 'drawn top to bottom: ' + String((e && e.message) || e).split('\n').slice(0, 2).join(' ').slice(0, 180) }); continue; }
      }
      out.push({ error: null, drawing });
    } catch (e) { out.push({ error: String((e && e.message) || e).split('\n').slice(0, 2).join(' ').slice(0, 200) }); }
  }
  return out;
}, { items, wrap: DIAGRAMS.wrapSequenceMessages, widen: DIAGRAMS.widenNotes, padding: DIAGRAMS.notePadding });

// The diagrams with a wrapped figure, drawn again with those figures as boxes, as the page does.
const again = DIAGRAMS.boxWrappedActors ? results.map((r, i) => (r.drawing && r.drawing.names.length ? { i, source: boxActors(diagrams[i].source, r.drawing.names) } : null)).filter(Boolean) : [];
const second = again.length
  ? await page.evaluate(async ({ again, wrap, widen, padding }) => {
    const w = /** @type {any} */ (window);
    w.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', sequence: { wrap } });
    const holder = document.createElement('div');
    document.body.append(holder);
    const out = [];
    for (const { i, source } of again) {
      try {
        const { svg } = await w.mermaid.render(`check-boxed-${i}`, source);
        holder.innerHTML = svg;
        out.push(w.measureDrawing(holder, widen, padding));
        holder.innerHTML = '';
      } catch (e) { out.push({ error: String((e && e.message) || e).split('\n')[0].slice(0, 160) }); }
    }
    return out;
  }, { again, wrap: DIAGRAMS.wrapSequenceMessages, widen: DIAGRAMS.widenNotes, padding: DIAGRAMS.notePadding })
  : [];
again.forEach(({ i }, k) => {
  const r = second[k];
  results[i].drawing = r && !r.error ? r : null;
  if (r && r.error) results[i].error = 'drawn with its wrapped figures as boxes: ' + r.error;
});
await browser.close();

// What is wrong with the drawing the reader sees, if anything.
for (const r of results) {
  if (r.error || !r.drawing) continue;
  if (r.drawing.names.length) r.error = `the name of ${r.drawing.names.join(', ')} wraps under its stick figure, where mermaid reserves no room for it`;
  else if (r.drawing.outside.length) r.error = `text outside the drawing: "${r.drawing.outside.join('", "')}"`;
}

const failed = diagrams.map((d, i) => ({ ...d, error: results[i].error })).filter((d) => d.error);
for (const f of failed) console.log(`FAIL ${f.where}\n     ${f.error}`);
console.log(`\n${diagrams.length - failed.length} of ${diagrams.length} mermaid diagrams render${failed.length ? `; ${failed.length} do not` : ''}.`);
process.exit(failed.length ? 1 : 0);
