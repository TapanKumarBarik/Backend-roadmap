import test from 'node:test';
import assert from 'node:assert/strict';
import { SEO_LIMITS, descriptionsTaken, seoProblems, serializeSeo, withSeoTitles } from './seo.js';

const KEY = 'backend/01-http/02-caching/README.md';
const OTHER = 'backend/01-http/01-requests/README.md';
const where = { isModuleFile: (key) => key === KEY || key === OTHER };
const DESCRIPTION = 'How HTTP caching decides what a browser may reuse, with the headers that control it and the mistakes to avoid.';

test('the limits are the ones a search result shows', () => {
  assert.deepEqual(SEO_LIMITS, { titleMax: 70, descriptionMin: 50, descriptionMax: 160 });
});

test('a good file, an empty one and one with only a title or only a description have nothing wrong', () => {
  assert.deepEqual(seoProblems({}, where), []);
  assert.deepEqual(seoProblems({ [KEY]: { title: 'HTTP caching explained', description: DESCRIPTION } }, where), []);
  assert.deepEqual(seoProblems({ [KEY]: { title: 'HTTP caching explained' }, [OTHER]: { description: `${DESCRIPTION} Again.` } }, where), []);
});

test('every rule is reported in words that name the page', () => {
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    [{ 'backend/01-http/09-gone/README.md': { title: 'x' } }, /is not a module of the site/],
    [{ 'backend/01-http/02-caching/index.md': { title: 'x' } }, /is not a module of the site/],
    [{ [KEY]: {} }, /needs a title or a description/],
    [{ [KEY]: 'title' }, /must be an object/],
    [{ [KEY]: { title: 'x', keywords: 'a' } }, /unknown field "keywords"/],
    [{ [KEY]: { title: 'x'.repeat(71) } }, /the title is 71 characters; a search result cuts it off after 70/],
    [{ [KEY]: { title: ' padded ' } }, /one line of text with no space at either end/],
    [{ [KEY]: { title: 'two\nlines' } }, /one line of text/],
    [{ [KEY]: { title: '' } }, /one line of text/],
    [{ [KEY]: { description: 'Too short.' } }, /the description is 10 characters; it needs 50 to 160/],
    [{ [KEY]: { description: 'd'.repeat(161) } }, /the description is 161 characters/],
    [{ [KEY]: { description: DESCRIPTION }, [OTHER]: { description: DESCRIPTION } }, /the same description as/]
  ];
  for (const [seo, expected] of cases) assert.match(seoProblems(seo, where).join('\n'), expected, JSON.stringify(seo));
  assert.match(seoProblems([], where)[0], /must be an object/);
  assert.match(seoProblems(null, where)[0], /must be an object/);
});

test('the limits are inclusive', () => {
  assert.deepEqual(seoProblems({ [KEY]: { title: 'x'.repeat(70), description: 'd'.repeat(50) } }, where), []);
  assert.deepEqual(seoProblems({ [KEY]: { description: 'd'.repeat(160) } }, where), []);
});

test('the file is written with the modules in order', () => {
  const text = serializeSeo({ [KEY]: { title: 'b' }, [OTHER]: { title: 'a' } });
  assert.ok(text.indexOf(OTHER) < text.indexOf(KEY));
  assert.ok(text.endsWith('}\n'));
});

test('an override replaces the whole title of its page and nothing else', () => {
  const titles = { [KEY]: { title: 'Caching', full: 'Caching · Backend Roadmap' }, [OTHER]: { title: 'Requests', full: 'Requests · Backend Roadmap' } };
  const result = withSeoTitles(titles, { [KEY]: { title: 'HTTP caching explained' }, 'x/README.md': { title: 'not a page' } });
  assert.deepEqual(result[KEY], { title: 'HTTP caching explained', full: 'HTTP caching explained' });
  assert.deepEqual(result[OTHER], titles[OTHER]);
  assert.equal(result['x/README.md'], undefined, 'an override for a page that is not there adds nothing');
  assert.equal(titles[KEY].full, 'Caching · Backend Roadmap', 'the generated titles are not changed');
  assert.equal(withSeoTitles(titles, { [KEY]: { description: DESCRIPTION } })[KEY].full, 'Caching · Backend Roadmap', 'a description alone keeps the generated title');
  assert.equal(withSeoTitles(titles, undefined), titles);
});

test('the descriptions written by hand are the ones taken', () => {
  assert.deepEqual([...descriptionsTaken({ a: { description: 'one one' }, b: { title: 'only' }, c: { description: 'two two' } })], ['one one', 'two two']);
  assert.equal(descriptionsTaken(undefined).size, 0);
});
