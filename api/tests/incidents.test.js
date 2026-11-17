// The daily incidents (content/practice/incidents.json, copied to api/generated/incidents.json for the API): every one is complete, its answer is one of its options, the lesson it
// points at exists, and the two files say the same. A catalogue this long goes round without repeating for as many days as it has incidents, so each one has to hold up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import source from '../../content/practice/incidents.json' with { type: 'json' };
import generated from '../generated/incidents.json' with { type: 'json' };

const CONTENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');
const { incidents } = source;

test('the API reads the same incidents as the content folder holds', () => {
  assert.deepEqual(generated.incidents, incidents, 'api/generated/incidents.json is a copy of content/practice/incidents.json: update both');
});

test('there are enough incidents that the daily one does not repeat within a month', () => {
  assert.ok(incidents.length >= 28, `${incidents.length} incidents`);
  assert.equal(new Set(incidents.map((i) => i.id)).size, incidents.length, 'ids are unique');
  assert.equal(new Set(incidents.map((i) => i.title)).size, incidents.length, 'titles are unique');
});

test('every incident has what the dialog shows, four options, and an answer that is one of them', () => {
  for (const i of incidents) {
    assert.match(i.id, /^inc-[a-z0-9-]+$/, i.id);
    assert.ok(i.service_name.length >= 3, `${i.id}: service_name`);
    assert.match(i.severity, /^P[123]$/, `${i.id}: severity`);
    for (const field of ['title', 'scenario_markdown', 'logs_snippet', 'post_mortem_markdown']) assert.ok(typeof i[field] === 'string' && i[field].trim().length > 20, `${i.id}: ${field}`);
    assert.deepEqual(i.options.map((o) => o.id), [1, 2, 3, 4], `${i.id}: options are numbered 1 to 4`);
    assert.ok(i.options.every((o) => typeof o.text === 'string' && o.text.length > 20), `${i.id}: option text`);
    assert.equal(new Set(i.options.map((o) => o.text)).size, 4, `${i.id}: options differ`);
    assert.ok([1, 2, 3, 4].includes(i.correct_option), `${i.id}: correct_option`);
    assert.match(i.post_mortem_markdown, /### Root Cause Analysis/, `${i.id}: the post-mortem names the root cause`);
    assert.match(i.post_mortem_markdown, /### The Resolution/, `${i.id}: and the resolution`);
  }
});

test('the right answer is not always the same option, and not the longest every time', () => {
  const counts = [1, 2, 3, 4].map((n) => incidents.filter((i) => i.correct_option === n).length);
  assert.ok(Math.max(...counts) <= Math.ceil(incidents.length * 0.4), `answers by option: ${counts.join(', ')}`);
  const longest = incidents.filter((i) => i.options.reduce((a, b) => (b.text.length > a.text.length ? b : a)).id === i.correct_option).length;
  assert.ok(longest <= Math.ceil(incidents.length * 0.35), `${longest} of ${incidents.length} right answers are the longest option, which a reader learns to guess`);
  // Four options of about the same size. A right answer that carries the cause and the remedy while the wrong ones are one short clause each is picked by its size alone.
  for (const i of incidents) {
    const right = i.options.find((o) => o.id === i.correct_option).text.length;
    const wrong = i.options.filter((o) => o.id !== i.correct_option).map((o) => o.text.length);
    const mean = wrong.reduce((a, b) => a + b, 0) / wrong.length;
    assert.ok(right <= mean * 1.5, `${i.id}: the right answer is ${right} characters and the wrong ones average ${Math.round(mean)}: lengthen the wrong ones or trim the right one`);
  }
});

test('the lesson an incident points at is a page of the site', () => {
  for (const i of incidents) {
    const file = path.join(CONTENT, i.related_module);
    assert.ok(fs.existsSync(file), `${i.id}: ${i.related_module} does not exist`);
    assert.ok(!/has not been written yet/.test(fs.readFileSync(file, 'utf8').slice(0, 2000)), `${i.id}: ${i.related_module} is still a placeholder`);
  }
});
