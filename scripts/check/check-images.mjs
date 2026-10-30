// Checks every image a module uses, so a broken or oversized one is caught here and not by a reader:
//   - the file exists (paths are relative to the module's own folder, as on GitHub)
//   - it is a local file in an allowed format and under the size limit (site.config.json -> content.images);
//     the site's security policy blocks images hosted elsewhere, and they disappear when the other site does
//   - it has alt text; an SVG has a width, height and viewBox so it renders at a sensible size
// Run it after adding or changing images:  npm run check:images   (how to make them: docs/IMAGES.md)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, CURRICULA } from '../lib/config.mjs';

const { maxBytes, extensions } = config.content.images;
const IGNORED = new Set(config.content.ignoredFiles);
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__']);

const problems = [];
const warnings = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);

function markdownFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) markdownFiles(path.join(dir, entry.name), out); }
    else if (entry.name.endsWith('.md') && !IGNORED.has(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

// Images mentioned inside code samples (an email template, an XSS example) are examples, not images the page shows.
const withoutCode = (md) => md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');

function imagesIn(md) {
  const found = [];
  for (const m of md.matchAll(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    found.push({ alt: m[1].trim(), src: m[2].replace(/^<|>$/g, '') });
  }
  for (const m of md.matchAll(/<img\b[^>]*>/gi)) {
    const attr = (name) => (m[0].match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i')) || [])[1];
    found.push({ alt: (attr('alt') || '').trim(), src: attr('src') || '' });
  }
  return found;
}

const referenced = new Set();
let modules = 0;
let references = 0;

for (const curriculum of CURRICULA) {
  const dir = path.join(ROOT, curriculum);
  if (!fs.existsSync(dir)) continue;
  for (const file of markdownFiles(dir)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const images = imagesIn(withoutCode(fs.readFileSync(file, 'utf8')));
    if (!images.length) continue;
    modules++;
    for (const { alt, src } of images) {
      references++;
      if (!src) { fail(rel, 'an image has no src'); continue; }
      if (/^(https?:)?\/\//i.test(src)) { fail(rel, `external image ${src}: save it in the module's images/ folder (the site's security policy blocks images from other hosts)`); continue; }
      if (/^data:/i.test(src)) { fail(rel, 'an inline data: image: save it as a file in the module\'s images/ folder'); continue; }
      const clean = src.split('#')[0].split('?')[0];
      const abs = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(file), decodeURI(clean));
      referenced.add(abs);
      if (!alt) fail(rel, `${src}: alt text is missing (say what the image shows, for readers who cannot see it)`);
      const ext = path.extname(abs).toLowerCase();
      if (!extensions.includes(ext)) fail(rel, `${src}: ${ext || 'no extension'} is not an allowed format (${extensions.join(', ')})`);
      if (!fs.existsSync(abs)) { fail(rel, `${src}: file not found`); continue; }
      const bytes = fs.statSync(abs).size;
      if (bytes > maxBytes) fail(rel, `${src}: ${(bytes / 1024).toFixed(0)} KB is over the ${(maxBytes / 1024).toFixed(0)} KB limit; compress it, or use SVG for diagrams and illustrations`);
      if (ext === '.svg') {
        const svg = fs.readFileSync(abs, 'utf8');
        const root = (svg.match(/<svg\b[^>]*>/i) || [''])[0];
        if (!/\sviewBox=/.test(root) || !/\swidth=/.test(root) || !/\sheight=/.test(root)) fail(rel, `${src}: the <svg> needs width, height and viewBox so it renders at a sensible size`);
        if (/<script\b/i.test(svg)) fail(rel, `${src}: SVGs must not contain scripts`);
        if (/\b(?:xlink:)?href\s*=\s*["']https?:/i.test(svg)) warn(rel, `${src}: refers to something hosted elsewhere; it will not load`);
      }
    }
  }
}

// Files in an images/ folder that no module uses.
function warnOrphans(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) warnOrphans(full); }
    else if (path.basename(dir) === 'images' && extensions.includes(path.extname(entry.name).toLowerCase()) && !referenced.has(full)) {
      warn(path.relative(ROOT, full).split(path.sep).join('/'), 'not used by any module');
    }
  }
}
for (const curriculum of CURRICULA) {
  if (fs.existsSync(path.join(ROOT, curriculum))) warnOrphans(path.join(ROOT, curriculum));
}

warnings.forEach((m) => console.warn('warning: ' + m));
if (problems.length) {
  console.error(`\n${problems.length} problem(s) with images:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`ok: ${references} image(s) in ${modules} module(s)`);
