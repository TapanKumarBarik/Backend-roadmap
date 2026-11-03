// Holds a built site to the address registry (docs/url-registry.tsv): every registered address still answers, still says the same
// thing to a search engine, and nothing that was indexed stops being. Pure: it takes what was read from dist/, so it is tested
// without a build. scripts/check/check-urls.mjs reads the files and prints the verdict.

/**
 * @param {{ registry: Record<string, {kind: string, indexable: boolean, canonical: boolean, text: boolean}>,
 *           pages: Record<string, {canonical: string|null, indexable: boolean, textLength: number}>,
 *           files: Record<string, boolean>, sitemap: string[], redirects: Array<{from: string, to: string, status: number}>, siteUrl: string }} site
 * @returns {{ problems: string[], checked: number, redirected: number, added: string[] }}
 */
export function checkAddresses({ registry, pages, files, sitemap, redirects, siteUrl }) {
  const problems = [];
  const base = siteUrl.replace(/\/$/, '');
  const moved = new Map(redirects.map((r) => [r.from, r]));
  const inSitemap = new Set(sitemap);
  const answers = (address) => (pages[address] ? 'page' : files[address] ? 'file' : null);
  let redirected = 0;

  // A redirect must be a permanent one to a place that answers, and must not lead round in a circle.
  for (const { from, to, status } of redirects) {
    if (![301, 308].includes(status)) problems.push(`${from}: redirects with ${status}, not permanently (301 or 308)`);
    if (to === '/' && from !== '/') problems.push(`${from}: redirects to the home page; an old address goes to its own replacement`);
    const seen = new Set([from]);
    // A pattern ("/lab/* /design-lab/:splat") is held to its fixed part: the place everything under it goes to must answer.
    let at = to.replace(/:splat$/, '');
    while (moved.has(at) && !seen.has(at)) { seen.add(at); at = moved.get(at).to; }
    if (seen.has(at) && moved.has(at)) problems.push(`${from}: redirects in a circle`);
    else if (!/^https?:/.test(at) && !answers(at)) problems.push(`${from}: redirects to ${at}, which nothing answers`);
  }

  for (const [address, expected] of Object.entries(registry)) {
    if (moved.has(address)) { redirected++; continue; } // a registered address that was moved is held to the redirect rules above
    const kind = answers(address);
    if (!kind) { problems.push(`${address}: gone (no page, no file, no redirect)`); continue; }
    if (expected.kind === 'file') { if (kind !== 'file') problems.push(`${address}: was a file and is a page now`); continue; }
    const page = pages[address];
    if (expected.canonical && !page.canonical) problems.push(`${address}: lost its canonical address`);
    if (page.canonical && page.canonical !== `${base}${address}`) problems.push(`${address}: canonical is ${page.canonical}, not itself (duplicate indexing)`);
    if (expected.indexable && !page.indexable) problems.push(`${address}: was indexable and now asks not to be (noindex)`);
    if (expected.text && page.textLength === 0) problems.push(`${address}: has no text for a crawler or a reader without JavaScript`);
    // The sitemap lists the pages that are content (the static ones, such as privacy, never were in it).
    if (expected.indexable && expected.text && page.indexable && !inSitemap.has(address) && address !== '/') problems.push(`${address}: indexable but missing from the sitemap`);
  }

  const added = [...Object.keys(pages), ...Object.keys(files)].filter((address) => !registry[address]).sort();
  return { problems, checked: Object.keys(registry).length, redirected, added };
}

/** The report (docs/URL_TEST_REPORT.md): what was checked, the verdict, and the addresses that are new since the registry. */
export function reportOf({ problems, checked, redirected, added }, { commit, when }) {
  const lines = [
    '# URL test report',
    '',
    `Written by \`npm run check:urls -- --report\`. Build of ${commit}, ${when}.`,
    '',
    `- Registered addresses checked: **${checked}**`,
    `- Answered by a permanent redirect: **${redirected}**`,
    `- Addresses that are new since the registry: **${added.length}**`,
    `- Verdict: **${problems.length ? `${problems.length} problem(s)` : 'every registered address still answers correctly'}**`
  ];
  if (problems.length) lines.push('', '## Problems', '', ...problems.map((p) => `- ${p}`));
  if (added.length) lines.push('', '## New addresses (allowed; they join the registry when it is regenerated)', '', ...added.slice(0, 200).map((a) => `- ${a}`), ...(added.length > 200 ? [`- … and ${added.length - 200} more`] : []));
  return `${lines.join('\n')}\n`;
}
