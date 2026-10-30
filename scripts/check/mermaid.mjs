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
import { ROOT, config, CURRICULA } from '../lib/config.mjs';

const args = process.argv.slice(2);
const channel = args.includes('--channel') ? args[args.indexOf('--channel') + 1] : config.screenshots.browserChannel;
const MERMAID_BUNDLE = path.join(ROOT, 'webapp', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
if (!fs.existsSync(MERMAID_BUNDLE)) {
  console.error('mermaid is not installed: run `npm install --prefix webapp` first.');
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
  const dir = path.join(ROOT, cur);
  if (!fs.existsSync(dir)) continue;
  for (const file of readmes(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    let n = 0;
    for (const m of text.matchAll(/^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
      n += 1;
      diagrams.push({ where: `${path.relative(ROOT, file).split(path.sep).join('/')} (diagram ${n})`, source: m[1] });
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

// Same settings the app renders with (webapp/src/lib/markdown/mermaidRender.js): strict security, no auto-start.
const results = await page.evaluate(async (items) => {
  window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const out = [];
  for (let i = 0; i < items.length; i++) {
    try { await window.mermaid.render(`check-${i}`, items[i].source); out.push(null); }
    catch (e) { out.push(String((e && e.message) || e).split('\n').slice(0, 2).join(' ').slice(0, 200)); }
  }
  return out;
}, diagrams);
await browser.close();

const failed = diagrams.map((d, i) => ({ ...d, error: results[i] })).filter((d) => d.error);
for (const f of failed) console.log(`FAIL ${f.where}\n     ${f.error}`);
console.log(`\n${diagrams.length - failed.length} of ${diagrams.length} mermaid diagrams render${failed.length ? `; ${failed.length} do not` : ''}.`);
process.exit(failed.length ? 1 : 0);
