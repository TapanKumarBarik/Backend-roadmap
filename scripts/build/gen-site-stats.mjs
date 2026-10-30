// Writes dist/site-stats.json: honest, build-time numbers for the landing page.
//
// "Module" means one folder with a README.md inside a track (backend/, learn/, genai/), or one top-level
// folder of lld/ (a flat course). Curriculum and track overview READMEs are not modules. A module whose
// first 25 lines contain the placeholder sentence is "planned", not "written" - the same rule the
// pre-render step uses to noindex it - so the count a visitor sees matches what they can actually read.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CURRICULA, isPlaceholderText } from '../lib/config.mjs';

const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }) : [])
  .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();
const read = (p) => fs.readFileSync(p, 'utf8');
const isPlaceholder = (p) => isPlaceholderText(read(p));
const h1 = (p) => (read(p).match(/^#\s+(.+)$/m) || [, ''])[1].trim();
const trackTitle = (p) => h1(p).replace(/^Track\s+\d+\s*[:\-–—]\s*/i, '');

const out = { generated: new Date().toISOString(), modules: { total: 0, written: 0, planned: 0 }, curricula: {}, tracks: {} };

for (const cur of CURRICULA) {
  const entry = { tracks: 0, modules: 0, written: 0, start: null, overview: fs.existsSync(path.join(ROOT, cur, 'README.md')) ? `${cur}/README.md` : null };
  const tracks = [];
  for (const t of dirs(path.join(ROOT, cur))) {
    const tdir = path.join(ROOT, cur, t);
    const subs = dirs(tdir);
    const mods = subs.length
      ? subs.map((m) => `${cur}/${t}/${m}/README.md`)
      : (fs.existsSync(path.join(tdir, 'README.md')) ? [`${cur}/${t}/README.md`] : []); // flat course (lld)
    const present = mods.filter((f) => fs.existsSync(path.join(ROOT, f)));
    if (!present.length) continue;
    const written = present.filter((f) => !isPlaceholder(path.join(ROOT, f)));
    entry.tracks += 1;
    entry.modules += present.length;
    entry.written += written.length;
    if (!entry.start && written.length) entry.start = written[0];
    if (subs.length && fs.existsSync(path.join(tdir, 'README.md'))) {
      tracks.push({ id: t, title: trackTitle(path.join(tdir, 'README.md')), modules: present.length, written: written.length, file: `${cur}/${t}/README.md` });
    }
  }
  out.curricula[cur] = entry;
  if (tracks.length) out.tracks[cur] = tracks;
  out.modules.total += entry.modules;
  out.modules.written += entry.written;
}
out.modules.planned = out.modules.total - out.modules.written;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist', 'site-stats.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote ${dest} (${out.modules.written} of ${out.modules.total} modules written, ${out.modules.planned} planned)`);
