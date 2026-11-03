import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistPage, parsePlaylistTitle, parseWatchPage } from './youtubePage.mjs';

test('a playlist page lists its videos in order, once each', () => {
  const html = '..."playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","thumbnail":{},"title":{"runs":[{"text":"One \u0026 two | Phase 2 #1"}]}}...'
    + '"playlistVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"Three"}]}}..."playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"One again"}]}}';
  assert.deepEqual(parsePlaylistPage(html), [{ id: 'aaaaaaaaaaa', title: 'One & two | Phase 2 #1' }, { id: 'bbbbbbbbbbb', title: 'Three' }]);
});

test('a playlist YouTube has not listed yet falls back to the video its picture shows', () => {
  const html = '<meta property="og:image" content="https://i.ytimg.com/vi/KQU5VPcJA6M/hqdefault.jpg?x=1">';
  assert.deepEqual(parsePlaylistPage(html), [{ id: 'KQU5VPcJA6M', title: '' }]);
  assert.deepEqual(parsePlaylistPage('<html></html>'), []);
});

test('the playlist title is read from the page', () => {
  assert.equal(parsePlaylistTitle('<meta property="og:title" content="Series · Phase 3: Caching, Scaling &amp; Traffic">'), 'Series · Phase 3: Caching, Scaling & Traffic');
  assert.equal(parsePlaylistTitle('<html></html>'), null);
});

test('a video page gives its title, description, length and upload time', () => {
  const html = String.raw`<meta itemprop="datePublished" content="2026-11-02T01:00:00-07:00">"title":"A \u0026 B","lengthSeconds":"218","shortDescription":"Line one\n\n0:00 Start"`;
  // The real page puts the description before the title and length; the parser does not depend on the order.
  assert.deepEqual(parseWatchPage(html), { title: 'A & B', description: 'Line one\n\n0:00 Start', seconds: 218, published: '2026-11-02T01:00:00-07:00' });
  assert.equal(parseWatchPage('<html></html>'), null);
});
