import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionCandidates, pickDescription, snippet, textOf, videoCandidates } from './describe.mjs';

const para = (text) => `<p>${text}</p>`;
const LONG = 'A session system has three parts that each have a wrong way to do them, and getting any of them wrong is costly.';

test('paragraphs that look back at other modules are passed over', () => {
  const html = para('Module 00 told you that stateful auth stores identity server-side and hands the client an opaque ID.')
    + para('Track 04 ended on a preview of it: the cheapest query is the one you never run, which is where this track begins.')
    + para(LONG);
  assert.deepEqual(descriptionCandidates(html), [LONG]);
});

test('a look back at the start of a paragraph is dropped and the sentence after it kept', () => {
  const html = para('Module 00 told you that stateful auth stores identity on the server. This module is where you build it correctly, with a store, a transport and a lifecycle.')
    + para('By the end of track 02 you could design a clean, validated, versioned REST API, and this track secures it.');
  assert.deepEqual(descriptionCandidates(html), ['This module is where you build it correctly, with a store, a transport and a lifecycle.']);
});

test('short paragraphs are not descriptions, and markup and entities are read as text', () => {
  assert.deepEqual(descriptionCandidates(para('Too short.')), []);
  assert.equal(textOf('<p>Use <code>Cache-Control</code> &amp; ETag , please.</p>'), 'Use Cache-Control & ETag, please.');
});

test('a long paragraph is cut at a word, with an ellipsis, inside the limit', () => {
  const [d] = descriptionCandidates(para('word '.repeat(80)));
  assert.ok(d.length <= 160);
  assert.ok(d.endsWith('…'));
  assert.ok(!d.endsWith(' …'));
});

test('"In track 06 you..." and "You are in Track 05" are look backs too', () => {
  const html = para('In track 06 you kept hearing one word every time reliability came up: idempotent. A retry that runs twice must change nothing the second time.')
    + para('You are in Track 05, GPUs and GenAI Hardware. Every earlier track treated the model as software, so this one starts with the machine under it.')
    + para('You already know Deployments and Services from local Kubernetes. The API objects stay the same on AKS, but the environment around them changes.')
    + para('So far the track has treated the cache as a single thing, Redis. Now it becomes several layers, each with its own rules for staleness.')
    + para('Earlier modules made a first request and walked through the text endpoints. This one adds the endpoint that returns vectors instead of text.');
  assert.deepEqual(descriptionCandidates(html), [
    'A retry that runs twice must change nothing the second time.',
    'Every earlier track treated the model as software, so this one starts with the machine under it.',
    'The API objects stay the same on AKS, but the environment around them changes.',
    'Now it becomes several layers, each with its own rules for staleness.',
    'This one adds the endpoint that returns vectors instead of text.'
  ]);
});

test('the key idea of a module is offered before its paragraphs', () => {
  const html = para('Sessions are the oldest trick in the book, and this opening paragraph goes on for a while before it says much.')
    + '<div class="cblock cblock-key"><div class="cblock-h">Key idea</div><div class="cblock-b"><p>A session is a server-side record that a cookie points at; the cookie is the key, not the data.</p>\n</div></div>';
  assert.equal(descriptionCandidates(html)[0], 'A session is a server-side record that a cookie points at; the cookie is the key, not the data.');
  assert.equal(descriptionCandidates(html).length, 2, 'the key idea is not offered twice');
});

test('a description is whole sentences when they fit, and cut only when the first one is too long', () => {
  const first = 'A cache holds a copy of something expensive to get, so the next reader does not pay for it again.';
  const second = 'The hard part is knowing when the copy has gone stale.';
  const third = 'That question has no answer that is both simple and always right, so every cache picks a side.';
  assert.equal(snippet(`${first} ${second} ${third}`), `${first} ${second}`, 'two sentences fit, the third would not');
  assert.equal(snippet(first), first);
  assert.ok(snippet(`${'long '.repeat(40)}end. ${second}`).endsWith('…'), 'a first sentence over the limit is cut');
});

test('a sentence that introduces a list is not part of a description', () => {
  const opening = 'Type the address and press Enter, and a whole trip starts before any of your code runs.';
  const trip = 'Here is the whole trip, in order, before your backend function runs:';
  assert.equal(snippet(`${opening} ${trip}`), opening, 'a closing line ending in a colon is dropped');
  const html = para('This module is the story of what scale bought, and it matters practically for three reasons:')
    + para('Scaling a model up made abilities appear that nobody had asked for, and that changed what the field built.');
  assert.deepEqual(descriptionCandidates(html), ['Scaling a model up made abilities appear that nobody had asked for, and that changed what the field built.']);
});

test('a candidate that fits whole is preferred to an earlier one that had to be cut', () => {
  const cutShort = `${'word '.repeat(60)}end.`;
  const whole = 'The second paragraph says in one sentence what the module is about.';
  const [a, b] = descriptionCandidates(para(cutShort) + para(whole));
  assert.ok(a.endsWith('…'));
  assert.equal(pickDescription([a, b], new Set(), 'fallback'), whole);
  assert.equal(pickDescription([a], new Set(), 'fallback'), a, 'but a cut one is better than the fallback');
});

test('an emoji and a "Goal:" label in front of a sentence are not part of the description', () => {
  const [d] = descriptionCandidates(para('🎯 Goal: Install, update, inspect and remove software reproducibly without an untracked pile of downloads.'));
  assert.equal(d, 'Install, update, inspect and remove software reproducibly without an untracked pile of downloads.');
});

test('inline code does not leave a gap inside brackets', () => {
  assert.equal(textOf('<p>Typed items in (<code>input</code>) and out (<code>output</code>).</p>'), 'Typed items in (input) and out (output).');
});

test('a page that is a video takes the sentences the video describes itself with', () => {
  const summary = 'Why is almost every app split into layers? In this lesson you will learn the client-server model and how single-tier, two-tier, three-tier and N-tier architectures differ.';
  const [d] = videoCandidates([{ summary }, { summary: '' }]);
  assert.ok(d.length <= 160 && d.startsWith('Why is almost every app split into layers?'));
  assert.deepEqual(videoCandidates([{ summary: '' }]), []);
});

test('two pages never get the same description', () => {
  const taken = new Set();
  const first = pickDescription([LONG, 'The second paragraph of the module, which says something else entirely about it.'], taken, 'fallback one');
  const second = pickDescription([LONG, 'The second paragraph of the module, which says something else entirely about it.'], taken, 'fallback two');
  const third = pickDescription([LONG], taken, 'fallback three');
  assert.equal(first, LONG);
  assert.equal(second, 'The second paragraph of the module, which says something else entirely about it.');
  assert.equal(third, 'fallback three');
});
