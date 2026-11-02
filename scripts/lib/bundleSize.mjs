// How much a visitor downloads, measured on the built site (dist/) in gzip, because that is what travels: what the first page
// needs, and what a screen adds when it is opened. scripts/check/check-bundle-size.mjs holds it to the budgets in site.config.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** The files in assets/ that a page's HTML names: its scripts, the chunks it preloads and its stylesheets. */
export function assetsOf(html) {
  return [...new Set(html.match(/assets\/[^"'\s>]+\.(?:js|css)/g) || [])].map((name) => name.slice('assets/'.length));
}

/** The chunks a chunk loads before it runs (static imports and re-exports); `import("./x.js")`, loaded later, is not one. */
export function importsOf(source) {
  return [...new Set([...source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]))];
}

/**
 * What `dist` makes a visitor download, in bytes of gzip: { initialJs, initialCss, screen(name) }. `screen('StudioView')` is what
 * opening that screen adds to the first page: its chunk and every chunk it needs that the first page did not already bring, or
 * null when the build has no chunk of that name.
 */
export function measureBuild(dist) {
  const assets = path.join(dist, 'assets');
  const gzipped = (name) => zlib.gzipSync(fs.readFileSync(path.join(assets, name))).length;
  const sum = (names) => names.reduce((total, name) => total + gzipped(name), 0);

  const first = assetsOf(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'));
  const initialJs = first.filter((name) => name.endsWith('.js'));
  const alreadyThere = new Set(initialJs);

  function screen(name) {
    const entry = fs.readdirSync(assets).find((file) => file.startsWith(`${name}-`) && file.endsWith('.js'));
    if (!entry) return null;
    const needed = new Set();
    const pending = [entry];
    while (pending.length) {
      const file = pending.pop();
      if (needed.has(file) || !fs.existsSync(path.join(assets, file))) continue;
      needed.add(file);
      pending.push(...importsOf(fs.readFileSync(path.join(assets, file), 'utf8')));
    }
    return sum([...needed].filter((file) => !alreadyThere.has(file)));
  }

  return { initialJs: sum(initialJs), initialCss: sum(first.filter((name) => name.endsWith('.css'))), screen };
}

/** Holds a measurement to its budgets (config.budgets, in KB): one line for each, and `ok` when none is over. */
export function checkBudgets(measured, budgets) {
  const kb = (bytes) => bytes / 1024;
  const lines = [
    { what: 'the first page, JavaScript', used: kb(measured.initialJs), limit: budgets.initialJsKb },
    { what: 'the first page, CSS', used: kb(measured.initialCss), limit: budgets.initialCssKb },
    ...Object.entries(budgets.screensKb).map(([name, limit]) => {
      const bytes = measured.screen(name);
      return { what: `opening ${name}`, used: bytes == null ? null : kb(bytes), limit };
    })
  ].map((line) => ({ ...line, over: line.used == null || line.used > line.limit }));
  return { lines, ok: lines.every((line) => !line.over) };
}
