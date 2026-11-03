import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pageSeo } from './seoPage.mjs';
import { descriptionCandidates, pickDescription } from './describe.mjs';
import { loadSeo, validateSeoAgainstContent } from './seo.mjs';
import { buildDocsIndex } from './docsIndex.mjs';
import { CONTENT_ROOT, CURRICULA } from './config.mjs';
import { siteFileProblems } from '../../webapp/src/lib/siteContent/index.js';
import { descriptionsTaken } from '../../webapp/src/lib/siteContent/seo.js';
import { loadRegistry } from './videos.mjs';

const OWN = 'Why the second index on a hot table slows every write down, and how to decide which one to drop first.';
const GENERATED = 'A schema is the contract between the application and its data, and an index is what makes that contract fast.';
const ANOTHER = 'Choosing a primary key that survives growth: sequential ids, UUIDs and the trade-offs of each in a busy system.';
const base = { title: 'Schema design', full: 'Schema design · Backend Roadmap', fallback: 'fallback text that is long enough to be a description of a page' };

test('without an override a page keeps its generated title and description, and uses up the description', () => {
  const taken = new Set();
  const seo = pageSeo({ ...base, candidates: [GENERATED], taken });
  assert.deepEqual(seo, { title: 'Schema design', fullTitle: 'Schema design · Backend Roadmap', description: GENERATED, generated: GENERATED });
  assert.ok(taken.has(GENERATED));
});

test('an override replaces the title everywhere it appears and the description, and the generated ones are still reported', () => {
  const seo = pageSeo({ ...base, override: { title: 'Schema design and indexing, explained', description: OWN }, candidates: [GENERATED], taken: descriptionsTaken({ a: { description: OWN } }) });
  assert.equal(seo.title, 'Schema design and indexing, explained', 'the social card title');
  assert.equal(seo.fullTitle, 'Schema design and indexing, explained', 'the <title> as written, with no site name added');
  assert.equal(seo.description, OWN);
  assert.equal(seo.generated, GENERATED, 'what the admin screen shows beside it');
});

test('a title alone leaves the description generated, and a description alone leaves the title', () => {
  assert.equal(pageSeo({ ...base, override: { title: 'Only a title for this page' }, candidates: [GENERATED], taken: new Set() }).description, GENERATED);
  const seo = pageSeo({ ...base, override: { description: OWN }, candidates: [GENERATED], taken: new Set() });
  assert.equal(seo.fullTitle, base.full);
  assert.equal(seo.description, OWN);
});

test('an override counts as taken: no other page may get the same description', () => {
  // Another page would have used OWN, as its best candidate; with the override taken it falls to the next one.
  const taken = descriptionsTaken({ 'x/README.md': { description: OWN } });
  const other = pageSeo({ ...base, candidates: [OWN, ANOTHER], taken });
  assert.equal(other.description, ANOTHER);
  assert.ok(taken.has(ANOTHER));
  assert.equal(pageSeo({ ...base, candidates: [OWN], taken: descriptionsTaken({ 'x/README.md': { description: OWN } }) }).description, base.fallback, 'nothing else free: the fallback');
});

test('a page with its own description does not use up the one it would have generated', () => {
  const taken = descriptionsTaken({ 'x/README.md': { description: OWN } });
  pageSeo({ ...base, override: { description: OWN }, candidates: [GENERATED], taken });
  assert.ok(!taken.has(GENERATED), 'the next page can still use it');
  assert.equal(pickDescription([GENERATED], taken, 'fallback'), GENERATED);
});

test('with no overrides the generated descriptions are what they always were', () => {
  const html = `<p>${GENERATED}</p><p>${ANOTHER}</p>`;
  assert.deepEqual(descriptionCandidates(html), [GENERATED, ANOTHER]);
  assert.equal(pageSeo({ ...base, override: undefined, candidates: descriptionCandidates(html), taken: descriptionsTaken(undefined) }).description, GENERATED);
});

test('seo.json is optional, and checked against the module files on disk', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  assert.deepEqual(loadSeo(path.join(folder, 'seo.json')), {}, 'no file: no overrides');
  fs.writeFileSync(path.join(folder, 'seo.json'), JSON.stringify({ a: { title: 'x' } }));
  assert.deepEqual(loadSeo(path.join(folder, 'seo.json')), { a: { title: 'x' } });
  fs.rmSync(folder, { recursive: true });

  const real = 'backend/01-request-response-fundamentals/README.md';
  assert.equal(fs.existsSync(path.join(CONTENT_ROOT, real)), true, 'the module used here exists');
  assert.deepEqual(validateSeoAgainstContent({ [real]: { title: 'A real module with its own title' } }), []);
  assert.match(validateSeoAgainstContent({ 'backend/00-not-a-module/README.md': { title: 'x' } }).join(), /is not a module of the site/);
});

// The editor reads the deployed site's index, the checkers read the disk: for the real content they must agree, or the editor would
// refuse a file `npm run check` accepts (or the reverse).
test('the real paths, videos and seo files pass the editor checks against an index built from the real content', () => {
  const { index } = buildDocsIndex(CONTENT_ROOT, CURRICULA);
  const where = { tree: index.tree, curricula: CURRICULA };
  const paths = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'paths.json'), 'utf8'));
  assert.deepEqual(siteFileProblems('paths.json', paths, where), []);
  assert.deepEqual(siteFileProblems('videos.json', loadRegistry(), where), []);
  assert.deepEqual(siteFileProblems('seo.json', loadSeo(), where), []);
});
