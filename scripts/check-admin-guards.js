#!/usr/bin/env node
/* Two build-time checks over the API, both guarding the same failure: an
 * admin-only endpoint that quietly stops being admin-only.
 *
 * 1. Every isAdmin() call must be awaited. isAdmin is async (it may consult
 *    the Admins table), and an un-awaited call returns a Promise, which is
 *    truthy — so the standard guard
 *
 *        if (!isAdmin(session)) return 403;
 *
 *    evaluates !Promise -> false and waves *everyone* through. Invisible in
 *    review, silent at runtime, total in effect.
 *
 * 2. Every API file must parse. Check 1 happily passes `await isAdmin(x)`
 *    sitting inside a function nobody made async — which is a SyntaxError
 *    that takes the whole Function app down on cold start. That is exactly
 *    how it first got in here: content.js had a synchronous requireAdmin()
 *    helper wrapping the call.
 *
 * CI runs this before deploy.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'api', 'src');
const CALL = /(?<!\.)\bisAdmin\s*\(/g;
const NL = String.fromCharCode(10);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

// Comments discuss isAdmin by name — including the warning above its own
// definition — so they have to go before matching, or the check trips over
// prose. Block comments are blanked rather than removed so line numbers stay
// correct in the error output.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split(NL)
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(NL);
}

const files = walk(ROOT);

const unparsed = [];
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    const detail = String(err.stderr || err).split(NL).slice(1, 4).join(' ').trim();
    unparsed.push(path.relative(process.cwd(), file) + '  ' + detail);
  }
}

if (unparsed.length) {
  console.error('API files that do not parse:' + NL);
  unparsed.forEach((u) => console.error('  ' + u));
  process.exit(1);
}

const problems = [];
let checked = 0;

for (const file of files) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split(NL);
  lines.forEach((line, i) => {
    if (/function\s+isAdmin/.test(line)) return;          // the definition
    if (/require\(|module\.exports/.test(line)) return;   // import / export
    for (const m of line.matchAll(CALL)) {
      checked++;
      if (!/await\s*$/.test(line.slice(0, m.index))) {
        problems.push(path.relative(process.cwd(), file) + ':' + (i + 1) + '  ' + line.trim());
      }
    }
  });
}

if (problems.length) {
  console.error('isAdmin() called without await — this silently grants admin to everyone:' + NL);
  problems.forEach((p) => console.error('  ' + p));
  console.error(NL + problems.length + ' of ' + checked + ' call(s) unguarded.');
  process.exit(1);
}

console.log('ok — ' + files.length + ' API files parse; all ' + checked + ' isAdmin() call(s) awaited');
