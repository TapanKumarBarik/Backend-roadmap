// Shared by the browser tests: a browser, a page that collects its own errors, and (for signed-in flows) the real
// API answering the page's /api requests inside the test process.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, config } from '../../scripts/lib/config.mjs';
import app from '../../api/app.js';
import { OWNER_EMAIL, createEnv, signedInAs } from '../../api/tests/helpers.js';

export const BASE = process.env.BASE || 'http://localhost:4180';
export { OWNER_EMAIL };

// The policy the site is served with (Cloudflare applies webapp/public/_headers); the local server does not, so the
// tests apply it themselves to find out whether anything the page needs is blocked.
const headersFile = fs.readFileSync(path.join(ROOT, 'webapp/public/_headers'), 'utf8');
export const CSP = /Content-Security-Policy:\s*(.+)/.exec(headersFile)[1].trim();

/** E2E_EXECUTABLE names a Chromium binary; otherwise the installed browser channel from site.config.json is used. */
export function launchBrowser() {
  return chromium.launch(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : { channel: config.screenshots.browserChannel });
}

/**
 * A fresh browser context and page. `problems` collects page errors and console errors; `goto()` loads `url` and waits
 * for the network to go quiet. `seenLanding` skips the first-visit landing page, as for a returning reader.
 */
export async function openPage(browser, url, { motion = 'no-preference', seenLanding = true, withCsp = false, width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion });
  if (seenLanding) await context.addInitScript(([k]) => { try { localStorage.setItem(k, '1'); } catch { /* blocked */ } }, [config.storage.seenLanding]);
  if (withCsp) {
    await context.route('**/*', async (route) => {
      try {
        if (!route.request().url().startsWith(BASE)) return await route.continue(); // the policy is ours; other sites send their own
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } });
      } catch {
        // The test ended while a request (the favicon, a picture) was still on its way and the context was closed under it:
        // there is nobody left to answer, and that is not a failure of the page.
      }
    });
  }
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { context, page, problems, goto: () => page.goto(BASE + url, { waitUntil: 'networkidle' }) };
}

/**
 * Answers every /api request of a context with the real API app and a fresh in-memory database, as a reader who is
 * signed in as `email` (or signed out when `email` is null). Returns the bindings, so a test can look at the rows the
 * page caused (`env.DB.raw.prepare(...).all()`).
 */
export async function answerApiInProcess(context, { email = 'reader@example.com' } = {}) {
  const env = createEnv();
  const cookie = email ? await signedInAs(email) : null;
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await app.request(url.pathname + url.search, {
      method: request.method(),
      headers: { ...request.headers(), ...(cookie ? { cookie } : {}) },
      body: request.postDataBuffer() ?? undefined
    }, env);
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer())
    });
  });
  return env;
}
