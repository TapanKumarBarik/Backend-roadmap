#!/usr/bin/env node
// Development screenshots: opens the site in a real browser and saves every page and viewport listed in
// site.config.json -> screenshots, so a UI change can be looked at instead of imagined. There is one copy of each
// screenshot and a run replaces it: no dated folders, no "latest" duplicate. Output stays local: screenshots/ is
// gitignored.
//
//   npm run shots                      against the local preview (config: screenshots.defaultBase)
//   npm run shots -- --base <url>      against any other URL (a dev server, a branch preview)
//   npm run shots:live                 against the production site
//   npm run shots -- --only landing,module
//
// The local preview is `npm run build && npm run preview` (port 4180). The browser is the installed one
// named in screenshots.browserChannel (msedge ships with Windows); set CHROME_PATH to use a specific binary.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, config, SITE_URL } from '../lib/config.mjs';

const cfg = config.screenshots;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const base = (flag('live') ? SITE_URL : value('base') || process.env.SHOTS_BASE || cfg.defaultBase).replace(/\/$/, '');
const only = (value('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const pages = only.length ? cfg.pages.filter((p) => only.includes(p.name)) : cfg.pages;
if (!pages.length) { console.error(`No page matches --only ${only.join(',')}. Known: ${cfg.pages.map((p) => p.name).join(', ')}`); process.exit(1); }

const outDir = path.join(ROOT, cfg.dir);
fs.mkdirSync(outDir, { recursive: true });

const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: cfg.browserChannel };
const browser = await chromium.launch(launchOptions).catch((e) => {
  console.error(`Could not start a browser (${JSON.stringify(launchOptions)}): ${e.message.split('\n')[0]}`);
  console.error('Set screenshots.browserChannel in site.config.json, or CHROME_PATH to a Chromium/Chrome/Edge executable.');
  process.exit(1);
});

console.log(`Capturing ${pages.length} page(s) x ${cfg.variants.length} variant(s) from ${base}`);
let failures = 0;
for (const p of pages) {
  for (const v of cfg.variants) {
    const mobile = v.width < 600;
    const height = (mobile ? p.mobileHeight : p.height) || v.height;
    const ctx = await browser.newContext({ viewport: { width: v.width, height }, colorScheme: v.colorScheme || 'light' });
    if (p.seenLanding) {
      // Show the working dashboard instead of the first-visit landing page.
      await ctx.addInitScript(([key]) => localStorage.setItem(key, '1'), [config.storage.seenLanding]);
    }
    const page = await ctx.newPage();
    const name = `${p.name}-${v.suffix}.png`;
    try {
      await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, name) });
      console.log(`  ok   ${name}`);
    } catch (e) {
      failures += 1;
      console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\nSaved to ${path.relative(ROOT, outDir)} (each run replaces the previous copy of what it captured)`);
process.exit(failures ? 1 : 0);
