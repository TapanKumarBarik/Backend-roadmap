import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCorrections, correctionsHtml, formatDay, loadCorrections, validateAgainstContent } from './corrections.mjs';

const entry = (over = {}) => ({ date: '2026-11-13', page: 'genai/a/b', title: 'A lesson', wrong: 'It said X.', changed: 'It says Y.', ...over });
const options = { hasPage: (folder) => folder === 'genai/a/b' || folder === 'genai/a/c' };

test('a log with nothing wrong in it has no problems', () => {
  assert.deepEqual(validateCorrections([entry(), entry({ date: '2026-11-01', page: 'genai/a/c' })], options), []);
  assert.deepEqual(validateCorrections([], options), []);
});

test('each mistake in the log is named with its entry', () => {
  const says = (list) => validateCorrections(list, options).join(' | ');
  assert.match(says([entry({ wrong: '' })]), /entry 1 \(A lesson\): "wrong" is missing or empty/);
  assert.match(says([entry({ changed: '   ' })]), /"changed" is missing or empty/);
  assert.match(says([entry({ title: undefined })]), /"title" is missing/);
  assert.match(says([entry({ date: '13/11/2026' })]), /not a date written YYYY-MM-DD/);
  assert.match(says([entry({ date: '2026-02-30' })]), /not a date written YYYY-MM-DD/, 'a day that does not exist');
  assert.match(says([entry({ page: 'genai/nowhere' })]), /there is no lesson at "genai\/nowhere"/);
  assert.match(says([entry({ date: '2026-11-01' }), entry({ date: '2026-11-13', page: 'genai/a/c' })]), /entry 2.*newest first/);
  assert.match(says([entry(), entry()]), /already corrected on 2026-11-13/);
  assert.equal(validateCorrections(/** @type {any} */ ({}), options)[0], 'corrections is not a list');
});

test('a day is written the way a reader says it, whatever the time zone of the machine', () => {
  assert.equal(formatDay('2026-11-13'), '13 November 2026');
  assert.equal(formatDay('2027-01-01'), '1 January 2027');
});

test('the log becomes the page: a card for each entry with its lesson as a link, its date, and what was wrong and changed, all escaped', () => {
  const html = correctionsHtml([entry({ wrong: 'It said <b>x</b> & "y".', title: 'Q & A' }), entry({ date: '2026-11-01', page: 'genai/a/c' })]);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.match(html, /<a href="\/genai\/a\/b\/">Q &amp; A<\/a>/);
  assert.match(html, /<time datetime="2026-11-13">13 November 2026<\/time>/);
  assert.match(html, /<dt>What was wrong<\/dt><dd>It said &lt;b&gt;x&lt;\/b&gt; &amp; &quot;y&quot;\.<\/dd>/);
  assert.match(html, /<dt>What changed<\/dt><dd>It says Y\.<\/dd>/);
  assert.doesNotMatch(html, /<b>/, 'nothing from an entry becomes markup');
  assert.equal(correctionsHtml([]), '');
  const percent = correctionsHtml([entry({ wrong: 'It fell from 84.2% to 41.8%.' })]);
  assert.match(percent, /84\.2&#37; to 41\.8&#37;/);
  assert.doesNotMatch(percent, /%/, 'no raw percent sign for the build to mistake for a placeholder');
});

test('the real log is valid: its lessons exist and it is newest first', () => {
  const entries = loadCorrections();
  assert.ok(entries.length >= 1, 'the first correction is in the log');
  assert.deepEqual(validateAgainstContent(entries), []);
});
