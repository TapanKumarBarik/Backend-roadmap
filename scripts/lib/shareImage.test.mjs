import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_COPY, cardFor, fitTitle, logoSvg, printable, shareImagePath, shareImageUrl, withAlpha } from './shareImage.mjs';

const curriculum = { path: 'backend', file: 'backend/README.md', title: 'Backend Engineering: Fundamentals → Distributed Systems', children: [{ file: 'a' }, { file: 'b' }] };
const track = { path: 'backend/01-http', file: 'backend/01-http/README.md', title: '01 - Request/Response Fundamentals', children: [{ file: 'x' }, { file: 'y' }, { file: 'z' }] };
const module = { file: 'backend/01-http/02-headers/README.md', title: 'Module 02: HTTP Headers Deep Dive', min: 13 };

test('a card is kept under the site\'s card folder, named after the page it belongs to', () => {
  assert.equal(shareImagePath('og', '/backend/01-http/02-headers/'), 'og/backend/01-http/02-headers.png');
  assert.equal(shareImagePath('og', '/backend/'), 'og/backend.png');
  assert.equal(shareImageUrl('https://example.org', 'og', '/backend/01-http/02-headers/'), 'https://example.org/og/backend/01-http/02-headers.png');
});

test('an address with escapes names a file without them, and is linked with them', () => {
  assert.equal(shareImagePath('og', '/learn/05-a%20b/'), 'og/learn/05-a b.png');
  assert.equal(shareImageUrl('https://example.org', 'og', '/learn/05-a%20b/'), 'https://example.org/og/learn/05-a%20b.png');
});

test('a module card says where the module sits, what it is called and how long it takes', () => {
  assert.deepEqual(cardFor({ node: module, ancestors: [curriculum, track] }), {
    title: 'HTTP Headers Deep Dive', kicker: 'Request/Response Fundamentals', badge: 'Backend Engineering', pill: '13 min read'
  });
});

test('a module with a video is a video lesson, and one nobody has written yet is coming soon', () => {
  assert.equal(cardFor({ node: module, ancestors: [curriculum, track], clips: [{}] }).pill, CARD_COPY.video);
  assert.equal(cardFor({ node: { ...module, min: undefined }, ancestors: [curriculum, track] }).pill, CARD_COPY.soon);
});

test('a module straight under its curriculum (a flat course) is not named twice', () => {
  const card = cardFor({ node: module, ancestors: [{ ...curriculum, path: 'lld', title: 'Low-Level Design: OOP to patterns' }] });
  assert.equal(card.kicker, 'Low-Level Design');
  assert.equal(card.badge, null);
});

test('a track says how many modules it has, and a curriculum how many tracks (or topics)', () => {
  assert.deepEqual(cardFor({ node: track, ancestors: [curriculum] }), { title: 'Request/Response Fundamentals', kicker: 'Backend Engineering', badge: null, pill: '3 modules' });
  assert.deepEqual(cardFor({ node: curriculum, ancestors: [] }), { title: 'Backend Engineering', kicker: CARD_COPY.curriculum, badge: null, pill: '2 tracks' });
  assert.equal(cardFor({ node: { ...curriculum, path: 'lld', children: [{ file: 'a' }, { file: 'b' }, { file: 'c' }] }, ancestors: [] }).pill, '3 topics');
});

test('a curriculum is named as the landing page names it, so "Learn" reads as "Linux to Cloud"', () => {
  const learn = { path: 'learn', file: 'learn/README.md', title: 'Learn: Linux to Platform Engineering', children: [{ file: 'a' }] };
  assert.equal(cardFor({ node: learn, ancestors: [] }).title, 'Linux to Cloud');
  assert.equal(cardFor({ node: track, ancestors: [learn] }).kicker, 'Linux to Cloud');
  assert.equal(cardFor({ node: { path: 'elsewhere', title: 'Elsewhere: a new curriculum', children: [] }, ancestors: [] }).title, 'Elsewhere');
});

test('a short title is set large, a long one smaller, and an enormous one is cut at a word', () => {
  assert.equal(fitTitle('Caching').size, 88);
  const medium = fitTitle('Designing a rate limiter that survives a thundering herd of retries');
  assert.ok(medium.size < 88 && medium.size >= 50 && !medium.text.endsWith('…'));
  const huge = fitTitle('word '.repeat(80).trim());
  assert.equal(huge.size, 50);
  assert.ok(huge.text.endsWith('…') && huge.text.length < 140);
});

test('text the card\'s face cannot draw is turned into words or dropped, and spacing is tidied', () => {
  assert.equal(printable('Fundamentals → Distributed Systems'), 'Fundamentals to Distributed Systems');
  assert.equal(printable('Tokens & “Context” — it’s 2×  bigger…'), 'Tokens & “Context” — it’s 2× bigger…');
  assert.equal(printable('Rocket 🚀 launch'), 'Rocket launch');
});

test('colours and the logo are built from the card\'s palette', () => {
  assert.equal(withAlpha('#e9a053', 0.2), 'rgba(233, 160, 83, 0.2)');
  const svg = logoSvg({ tile: '#111111', ink: '#222222', dot: '#333333' });
  assert.match(svg, /fill="#111111"/);
  assert.match(svg, /stroke="#222222"/);
  assert.match(svg, /fill="#333333"/);
});
