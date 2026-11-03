// The registered addresses, asked of a running site (a preview, the staging deploy, production) the way a visitor, a crawler or a
// YouTube link does: each must answer 200 with the right canonical address and some text, or a permanent redirect to an address
// that does; the same address without its trailing slash must still reach it; and there are no redirect loops and no 404.
// `fetchImpl` is injected so the logic is tested without a network. scripts/maintain/check-urls-live.mjs runs it.
import { pageFacts } from './publicUrls.mjs';

const REDIRECTS = new Set([301, 302, 307, 308]);
const PERMANENT = new Set([301, 308]);
const MAX_HOPS = 5;

/** Follows one address by hand: { status, url, hops: [{status, to}], html }. */
async function follow(fetchImpl, base, address) {
  let url = new URL(address, base).href;
  const hops = [];
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await fetchImpl(url, { redirect: 'manual' });
    if (!REDIRECTS.has(res.status)) return { status: res.status, url, hops, html: res.status === 200 ? await res.text() : '', type: res.headers.get('content-type') || '' };
    const to = new URL(res.headers.get('location') || '', url).href;
    hops.push({ status: res.status, to });
    if (to === url || hops.some((h, n) => hops.findIndex((x) => x.to === h.to) !== n)) return { status: 'loop', url, hops, html: '', type: '' };
    url = to;
  }
  return { status: 'loop', url, hops, html: '', type: '' };
}

/**
 * @param {{ base: string, siteUrl: string, registry: Record<string, {kind: string, canonical?: boolean, text?: boolean}>,
 *           fetchImpl?: (url: string, init?: object) => Promise<{status: number, headers: {get(name: string): string | null}, text(): Promise<string>}>,
 *           addresses?: string[], concurrency?: number, slashless?: boolean }} options
 * @returns {Promise<{ problems: string[], checked: number }>}
 */
export async function checkLive({ base, siteUrl, registry, fetchImpl = fetch, addresses = Object.keys(registry), concurrency = 8, slashless = true }) {
  const problems = [];
  const home = siteUrl.replace(/\/$/, '');
  const queue = [...addresses];

  async function check(address) {
    const expected = registry[address];
    const got = await follow(fetchImpl, base, address);
    if (got.status === 'loop') { problems.push(`${address}: redirects in a loop`); return; }
    if (got.hops.some((hop) => !PERMANENT.has(hop.status))) problems.push(`${address}: redirected with a temporary redirect (${got.hops.map((h) => h.status).join(', ')})`);
    if (got.status !== 200) { problems.push(`${address}: answers ${got.status}${got.hops.length ? ` after ${got.hops.length} redirect(s)` : ''}`); return; }
    if (expected.kind === 'page') {
      const facts = pageFacts(got.html);
      if (!/html/.test(got.type)) problems.push(`${address}: is not HTML (${got.type})`);
      if (expected.canonical && facts.canonical !== `${home}${new URL(got.url).pathname}`) problems.push(`${address}: canonical is ${facts.canonical}, not ${home}${new URL(got.url).pathname}`);
      if (expected.text && facts.textLength === 0) problems.push(`${address}: has no text`);
    }
    // The same address typed without the slash still gets there (the server adds it with a permanent redirect, or answers it).
    if (slashless && expected.kind === 'page' && address.length > 1 && address.endsWith('/')) {
      const bare = await follow(fetchImpl, base, address.slice(0, -1));
      if (bare.status !== 200) problems.push(`${address.slice(0, -1)}: without its slash answers ${bare.status}`);
      else if (bare.hops.some((hop) => !PERMANENT.has(hop.status))) problems.push(`${address.slice(0, -1)}: without its slash is redirected temporarily`);
    }
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const address = queue.shift();
      try { await check(address); } catch (err) { problems.push(`${address}: ${err.message}`); }
    }
  });
  await Promise.all(workers);
  return { problems: problems.sort(), checked: addresses.length };
}
